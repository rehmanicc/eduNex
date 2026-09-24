const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const FinanceAccount=require('../../models/FinanceAccount');
const FinanceHead=require('../../models/FinanceHead');
const FinanceTransaction=require('../../models/FinanceTransaction');
const {audit}=require('../../services/auditService');
const finance=require('../../services/financeService');

function positive(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null}
function dateStart(v){if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))return null;d.setHours(0,0,0,0);return d}
function dateEnd(v){if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))return null;d.setHours(23,59,59,999);return d}
function can(req,p){const set=new Set(req.user?.effectivePermissions||req.user?.permissions||[]);return req.user?.systemRole==='platform_owner'||set.has('*')||set.has(p)}
function populateTx(q){return q.populate('headId','name code type').populate('accountId','name type').populate('fromAccountId','name type').populate('toAccountId','name type').populate('branchId','name').populate('createdBy','name email').populate('approvedBy','name email').populate('postedBy','name email')}

exports.setup=async(req,res)=>{
  await finance.ensureDefaults(cid(req),req.user?._id);
  res.json({ok:true});
};

exports.listAccounts=async(req,res)=>{
  await finance.ensureDefaults(cid(req),req.user?._id);
  const accounts=await FinanceAccount.find({collegeId:cid(req)}).populate('branchId','name').sort({isActive:-1,type:1,name:1}).lean();
  const posted=await FinanceTransaction.find({collegeId:cid(req),status:{$in:['posted','reversed']}}).lean();
  const balances={};for(const tx of posted)for(const d of finance.accountDeltas(tx))balances[d.accountId]=(balances[d.accountId]||0)+d.amount;
  res.json(accounts.map(a=>({...a,currentBalance:Number((balances[String(a._id)]||0).toFixed(2))})));
};

exports.createAccount=async(req,res)=>{
  const collegeId=cid(req);const name=String(req.body.name||'').trim();const type=String(req.body.type||'').trim();
  if(!name)return bad(res,'Account name is required');if(!['cash','bank','petty_cash'].includes(type))return bad(res,'Valid account type is required');
  const opening=Number(req.body.openingBalance||0);if(!Number.isFinite(opening)||opening<0)return bad(res,'Opening balance cannot be negative');
  const account=await FinanceAccount.create({collegeId,branchId:req.body.branchId||null,name,type,bankName:req.body.bankName,accountNumber:req.body.accountNumber,bankBranch:req.body.bankBranch,openingBalance:opening,openingDate:req.body.openingDate||new Date(),description:req.body.description,createdBy:req.user._id});
  if(opening>0){const transactionNo=await finance.nextTransactionNo(collegeId,'opening_balance',account.openingDate);await FinanceTransaction.create({collegeId,branchId:account.branchId,transactionNo,type:'opening_balance',transactionDate:account.openingDate,accountId:account._id,amount:opening,paymentMethod:type==='cash'||type==='petty_cash'?'cash':'bank_transfer',description:`Opening balance - ${account.name}`,sourceModule:'finance',sourceDocumentType:'FinanceAccount',sourceDocumentId:account._id,sourceReference:account.name,status:'posted',createdBy:req.user._id,approvedBy:req.user._id,approvedAt:new Date(),postedBy:req.user._id,postedAt:new Date()});}
  await audit(req,'CREATE_FINANCE_ACCOUNT','FinanceAccount',account._id,{name,type,openingBalance:opening});res.status(201).json(account);
};

exports.updateAccount=async(req,res)=>{
  const account=await FinanceAccount.findOne({_id:req.params.id,collegeId:cid(req)});if(!account)return bad(res,'Finance account not found',404);
  const allowed=['name','bankName','accountNumber','bankBranch','description','isActive','branchId'];for(const key of allowed)if(Object.prototype.hasOwnProperty.call(req.body,key))account[key]=req.body[key]||((key==='branchId')?null:req.body[key]);
  account.updatedBy=req.user._id;await account.save();await audit(req,'UPDATE_FINANCE_ACCOUNT','FinanceAccount',account._id);res.json(account);
};

exports.listHeads=async(req,res)=>{
  await finance.ensureDefaults(cid(req),req.user?._id);const q={collegeId:cid(req)};if(req.query.type)q.type=req.query.type;if(req.query.active==='true')q.isActive=true;
  res.json(await FinanceHead.find(q).sort({type:1,isSystem:-1,name:1}));
};

exports.createHead=async(req,res)=>{
  const type=String(req.body.type||'');const name=String(req.body.name||'').trim();let code=String(req.body.code||name).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
  if(!['income','expense'].includes(type))return bad(res,'Head type must be income or expense');if(!name||!code)return bad(res,'Head name is required');
  const head=await FinanceHead.create({collegeId:cid(req),type,name,code,description:req.body.description,createdBy:req.user._id});await audit(req,'CREATE_FINANCE_HEAD','FinanceHead',head._id,{type,code});res.status(201).json(head);
};

exports.updateHead=async(req,res)=>{
  const head=await FinanceHead.findOne({_id:req.params.id,collegeId:cid(req)});if(!head)return bad(res,'Finance head not found',404);
  if(req.body.name)head.name=String(req.body.name).trim();if(Object.prototype.hasOwnProperty.call(req.body,'isActive'))head.isActive=!!req.body.isActive;if(Object.prototype.hasOwnProperty.call(req.body,'description'))head.description=req.body.description;head.updatedBy=req.user._id;await head.save();await audit(req,'UPDATE_FINANCE_HEAD','FinanceHead',head._id);res.json(head);
};

function transactionFilter(req,type){
  const q={collegeId:cid(req)};if(type)q.type=type;else if(req.query.type)q.type=req.query.type;if(req.query.status)q.status=req.query.status;if(req.query.accountId)q.$or=[{accountId:req.query.accountId},{fromAccountId:req.query.accountId},{toAccountId:req.query.accountId}];if(req.query.headId)q.headId=req.query.headId;if(req.query.sourceModule)q.sourceModule=req.query.sourceModule;
  const from=dateStart(req.query.from),to=dateEnd(req.query.to);if(from||to)q.transactionDate={...(from?{$gte:from}:{}),...(to?{$lte:to}:{})};
  if(req.query.search){const rx=new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');q.$and=[{$or:[{transactionNo:rx},{referenceNo:rx},{sourceReference:rx},{description:rx},{payee:rx}]}];}
  return q;
}

exports.listTransactions=async(req,res)=>{
  const q=transactionFilter(req);const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));const total=await FinanceTransaction.countDocuments(q);const items=await populateTx(FinanceTransaction.find(q)).sort({transactionDate:-1,createdAt:-1}).skip((page-1)*limit).limit(limit).lean();res.json({items,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}});
};
exports.listIncome=(req,res)=>{req.query.type='income';return exports.listTransactions(req,res)};
exports.listExpenses=(req,res)=>{req.query.type='expense';return exports.listTransactions(req,res)};

exports.createTransaction=async(req,res)=>{
  const collegeId=cid(req),type=String(req.body.type||'');if(!['income','expense','transfer'].includes(type))return bad(res,'Transaction type must be income, expense or transfer');const amount=positive(req.body.amount);if(!amount)return bad(res,'Valid amount is required');await finance.ensureDefaults(collegeId,req.user._id);
  const data={collegeId,branchId:req.body.branchId||null,transactionNo:await finance.nextTransactionNo(collegeId,type,req.body.transactionDate),type,transactionDate:req.body.transactionDate||new Date(),amount,paymentMethod:req.body.paymentMethod||'cash',payee:req.body.payee,referenceNo:req.body.referenceNo,description:req.body.description,attachmentUrl:req.body.attachmentUrl,sourceModule:'finance',status:'draft',createdBy:req.user._id};
  if(type==='transfer'){
    if(!req.body.fromAccountId||!req.body.toAccountId||String(req.body.fromAccountId)===String(req.body.toAccountId))return bad(res,'Different From and To accounts are required for a transfer');
    const count=await FinanceAccount.countDocuments({collegeId,_id:{$in:[req.body.fromAccountId,req.body.toAccountId]},isActive:true});if(count!==2)return bad(res,'Invalid transfer account');data.fromAccountId=req.body.fromAccountId;data.toAccountId=req.body.toAccountId;
  }else{
    const account=await FinanceAccount.findOne({_id:req.body.accountId,collegeId,isActive:true});if(!account)return bad(res,'Valid Finance account is required');const head=await FinanceHead.findOne({_id:req.body.headId,collegeId,type,isActive:true});if(!head)return bad(res,`Valid ${type} head is required`);data.accountId=account._id;data.headId=head._id;
  }
  const tx=await FinanceTransaction.create(data);await audit(req,'CREATE_FINANCE_TRANSACTION','FinanceTransaction',tx._id,{transactionNo:tx.transactionNo,type,amount});res.status(201).json(await populateTx(FinanceTransaction.findById(tx._id)));
};

exports.updateTransaction=async(req,res)=>{
  const tx=await FinanceTransaction.findOne({_id:req.params.id,collegeId:cid(req)});if(!tx)return bad(res,'Finance transaction not found',404);if(tx.status!=='draft')return bad(res,'Only draft transactions can be edited',409);
  const allowed=['transactionDate','headId','accountId','fromAccountId','toAccountId','amount','paymentMethod','payee','referenceNo','description','attachmentUrl','branchId'];for(const key of allowed)if(Object.prototype.hasOwnProperty.call(req.body,key))tx[key]=req.body[key]||((['branchId','headId','accountId','fromAccountId','toAccountId'].includes(key))?null:req.body[key]);if(!positive(tx.amount))return bad(res,'Valid amount is required');tx.updatedBy=req.user._id;await tx.save();await audit(req,'UPDATE_FINANCE_TRANSACTION','FinanceTransaction',tx._id);res.json(tx);
};

exports.submitTransaction=async(req,res)=>{
  const tx=await FinanceTransaction.findOne({_id:req.params.id,collegeId:cid(req)});if(!tx)return bad(res,'Finance transaction not found',404);if(tx.status!=='draft')return bad(res,'Only draft transactions can be submitted',409);tx.status='pending_approval';tx.submittedBy=req.user._id;tx.submittedAt=new Date();await tx.save();await audit(req,'SUBMIT_FINANCE_TRANSACTION','FinanceTransaction',tx._id);res.json(tx);
};
exports.approveTransaction=async(req,res)=>{
  const tx=await FinanceTransaction.findOne({_id:req.params.id,collegeId:cid(req)});if(!tx)return bad(res,'Finance transaction not found',404);if(!['pending_approval','draft'].includes(tx.status))return bad(res,'Transaction is not awaiting approval',409);tx.status='approved';tx.approvedBy=req.user._id;tx.approvedAt=new Date();await tx.save();await audit(req,'APPROVE_FINANCE_TRANSACTION','FinanceTransaction',tx._id);res.json(tx);
};
exports.postTransaction=async(req,res)=>{
  const tx=await FinanceTransaction.findOne({_id:req.params.id,collegeId:cid(req)});if(!tx)return bad(res,'Finance transaction not found',404);if(tx.status!=='approved')return bad(res,'Transaction must be approved before posting',409);tx.status='posted';tx.postedBy=req.user._id;tx.postedAt=new Date();await tx.save();await audit(req,'POST_FINANCE_TRANSACTION','FinanceTransaction',tx._id);res.json(tx);
};
exports.reverseTransaction=async(req,res)=>{
  const original=await FinanceTransaction.findOne({_id:req.params.id,collegeId:cid(req)});if(!original)return bad(res,'Finance transaction not found',404);if(original.status!=='posted')return bad(res,'Only posted transactions can be reversed',409);const reason=String(req.body.reason||'').trim();if(!reason)return bad(res,'Reversal reason is required');
  const no=await finance.nextTransactionNo(cid(req),'reversal',req.body.transactionDate||new Date());const reversal=await FinanceTransaction.create({collegeId:cid(req),branchId:original.branchId,transactionNo:no,type:'reversal',transactionDate:req.body.transactionDate||new Date(),amount:original.amount,paymentMethod:original.paymentMethod,referenceNo:original.transactionNo,description:`Reversal of ${original.transactionNo}: ${reason}`,sourceModule:'finance',sourceDocumentType:'FinanceTransaction',sourceDocumentId:original._id,sourceReference:original.transactionNo,status:'posted',createdBy:req.user._id,approvedBy:req.user._id,approvedAt:new Date(),postedBy:req.user._id,postedAt:new Date(),reversalOf:original._id,reversalReason:reason,accountId:original.accountId,fromAccountId:original.toAccountId||null,toAccountId:original.fromAccountId||null,headId:original.headId});
  // Reversal keeps original type semantics by storing the negating account movement via swapped transfer accounts or the special reversal reference.
  original.status='reversed';original.reversedBy=req.user._id;original.reversedAt=new Date();original.reversalTransactionId=reversal._id;original.reversalReason=reason;await original.save();await audit(req,'REVERSE_FINANCE_TRANSACTION','FinanceTransaction',original._id,{reversalTransactionNo:no,reason});res.status(201).json({original,reversal});
};

function signedDeltas(tx){
  if(tx.type!=='reversal')return finance.accountDeltas(tx);
  return [];
}
async function balanceMap(collegeId,until=null){
  const q={collegeId,status:{$in:['posted','reversed']}};if(until)q.transactionDate={$lte:until};const rows=await FinanceTransaction.find(q).lean();const map={};
  const byId=new Map(rows.map(x=>[String(x._id),x]));
  for(const tx of rows){
    let deltas;
    if(tx.type==='reversal'){
      const orig=byId.get(String(tx.reversalOf))||await FinanceTransaction.findById(tx.reversalOf).lean();deltas=(orig?finance.accountDeltas(orig):[]).map(d=>({...d,amount:-d.amount}));
    }else deltas=signedDeltas(tx);
    for(const d of deltas)map[d.accountId]=(map[d.accountId]||0)+d.amount;
  }
  return map;
}

exports.dashboard=async(req,res)=>{
  await finance.ensureDefaults(cid(req),req.user?._id);const collegeId=cid(req),now=new Date();const dayStart=new Date(now);dayStart.setHours(0,0,0,0);const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const rows=await FinanceTransaction.find({collegeId,status:{$in:['posted','reversed']}}).lean();const originalById=new Map(rows.map(x=>[String(x._id),x]));let todayIncome=0,todayExpense=0,monthIncome=0,monthExpense=0,totalIncome=0,totalExpense=0;
  for(const tx of rows){let sign=1,base=tx;if(tx.type==='reversal'){base=originalById.get(String(tx.reversalOf));sign=-1;if(!base)continue;}const d=new Date(tx.transactionDate);if(base.type==='income'){totalIncome+=sign*tx.amount;if(d>=monthStart)monthIncome+=sign*tx.amount;if(d>=dayStart)todayIncome+=sign*tx.amount;}if(base.type==='expense'){totalExpense+=sign*tx.amount;if(d>=monthStart)monthExpense+=sign*tx.amount;if(d>=dayStart)todayExpense+=sign*tx.amount;}}
  const balances=await balanceMap(collegeId);const accounts=await FinanceAccount.find({collegeId,isActive:true}).lean();let cashBalance=0,bankBalance=0;for(const a of accounts){const b=balances[String(a._id)]||0;if(a.type==='bank')bankBalance+=b;else cashBalance+=b;}
  const recent=await populateTx(FinanceTransaction.find({collegeId,status:{$in:['posted','reversed']}})).sort({transactionDate:-1,createdAt:-1}).limit(8).lean();res.json({todayIncome,todayExpense,monthIncome,monthExpense,totalIncome,totalExpense,netPosition:totalIncome-totalExpense,cashBalance,bankBalance,recent});
};

exports.accountLedger=async(req,res)=>{
  const account=await FinanceAccount.findOne({_id:req.params.id,collegeId:cid(req)}).lean();if(!account)return bad(res,'Finance account not found',404);const rows=await FinanceTransaction.find({collegeId:cid(req),status:{$in:['posted','reversed']},$or:[{accountId:account._id},{fromAccountId:account._id},{toAccountId:account._id}]}).sort({transactionDate:1,createdAt:1}).lean();const all=await FinanceTransaction.find({collegeId:cid(req),status:{$in:['posted','reversed']}}).lean();const byId=new Map(all.map(x=>[String(x._id),x]));let balance=0;const ledger=[];for(const tx of rows){let delta=0;if(tx.type==='reversal'){const orig=byId.get(String(tx.reversalOf));const od=(orig?finance.accountDeltas(orig):[]).find(x=>x.accountId===String(account._id));delta=-(od?.amount||0);}else delta=finance.accountDeltas(tx).find(x=>x.accountId===String(account._id))?.amount||0;balance+=delta;ledger.push({...tx,moneyIn:delta>0?delta:0,moneyOut:delta<0?-delta:0,balance:Number(balance.toFixed(2))});}res.json({account,ledger,currentBalance:Number(balance.toFixed(2))});
};

exports.reportSummary=async(req,res)=>{
  const q=transactionFilter(req);q.status={$in:['posted','reversed']};const rows=await populateTx(FinanceTransaction.find(q)).sort({transactionDate:-1}).lean();const all=await FinanceTransaction.find({collegeId:cid(req),status:{$in:['posted','reversed']}}).lean();const byId=new Map(all.map(x=>[String(x._id),x]));let income=0,expense=0;for(const tx of rows){if(tx.type==='income')income+=tx.amount;else if(tx.type==='expense')expense+=tx.amount;else if(tx.type==='reversal'){const orig=byId.get(String(tx.reversalOf));if(orig?.type==='income')income-=tx.amount;if(orig?.type==='expense')expense-=tx.amount;}}res.json({income,expense,net:income-expense,count:rows.length,rows});
};
