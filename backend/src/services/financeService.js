const FinanceAccount=require('../models/FinanceAccount');
const FinanceHead=require('../models/FinanceHead');
const FinanceTransaction=require('../models/FinanceTransaction');
const seq=require('./sequenceService');

const SYSTEM_HEADS={
  income:[
    ['STUDENT_FEES','Student Fees'],['ADMISSION_PROSPECTUS','Admission / Prospectus Income'],['TRANSPORT_INCOME','Transport Income'],['HOSTEL_INCOME','Hostel Income'],['DONATIONS','Donations'],['RENT_INCOME','Rent Income'],['GRANTS','Grants'],['OTHER_INCOME','Other Income']
  ],
  expense:[
    ['SALARIES','Salaries'],['UTILITIES','Utilities'],['ELECTRICITY','Electricity'],['GAS','Gas'],['INTERNET','Internet'],['RENT','Rent'],['STATIONERY','Stationery'],['PRINTING','Printing'],['MAINTENANCE','Maintenance'],['FUEL','Fuel'],['TRANSPORT_EXPENSE','Transport Expense'],['HOSTEL_EXPENSE','Hostel Expense'],['EXAMINATION','Examination Expense'],['MARKETING','Marketing'],['REPAIRS','Repairs'],['EQUIPMENT','Equipment Purchase'],['MISCELLANEOUS','Miscellaneous Expense']
  ]
};

async function upsertDefaultAccount(collegeId,name,defaults){
  try{
    return await FinanceAccount.findOneAndUpdate(
      {collegeId,name},
      {$setOnInsert:{collegeId,name,...defaults}},
      {upsert:true,new:true,setDefaultsOnInsert:true}
    );
  }catch(err){
    // Two requests can initialize Finance at the same time. If another request
    // wins the unique-key insert race, reuse the account it just created.
    if(err?.code===11000)return FinanceAccount.findOne({collegeId,name});
    throw err;
  }
}

async function ensureDefaults(collegeId,userId){
  const cash=await upsertDefaultAccount(collegeId,'Cash in Hand',{
    type:'cash',isSystem:true,createdBy:userId
  });
  await upsertDefaultAccount(collegeId,'Bank / Online Clearing',{
    type:'bank',isSystem:true,
    description:'Default clearing account for bank/online receipts until a specific bank account is selected.',
    createdBy:userId
  });
  for(const type of ['income','expense'])for(const [code,name] of SYSTEM_HEADS[type]){
    try{
      await FinanceHead.findOneAndUpdate(
        {collegeId,type,code},
        {$setOnInsert:{collegeId,type,code,name,isSystem:true,isActive:true,createdBy:userId}},
        {upsert:true,new:true,setDefaultsOnInsert:true}
      );
    }catch(err){
      // Same protection for concurrent first-load initialization of system heads.
      if(err?.code!==11000)throw err;
    }
  }
  return cash;
}

function prefixFor(type){return ({income:'INC',expense:'EXP',transfer:'TRF',opening_balance:'OPN',reversal:'REV'})[type]||'FIN'}
async function nextTransactionNo(collegeId,type,date=new Date()){
  const year=new Date(date).getFullYear();const yy=String(year).slice(-2);const prefix=prefixFor(type);
  const n=await seq.nextNumber(collegeId,`finance-${prefix}-${year}`);
  return `${prefix}${yy}${String(n).padStart(6,'0')}`;
}

async function resolveDefaultAccount(collegeId,paymentMethod,userId){
  await ensureDefaults(collegeId,userId);
  if(paymentMethod==='cash')return FinanceAccount.findOne({collegeId,type:'cash',isActive:true}).sort({isSystem:-1,createdAt:1});
  const bank=await FinanceAccount.findOne({collegeId,type:'bank',isActive:true}).sort({createdAt:1});
  return bank||FinanceAccount.findOne({collegeId,type:'cash',isActive:true}).sort({isSystem:-1,createdAt:1});
}

async function postSourceTransaction({collegeId,branchId,type,amount,transactionDate,paymentMethod='cash',accountId,headCode,sourceModule,sourceDocumentType,sourceDocumentId,sourceReference,description,payee,userId}){
  if(!collegeId||!sourceDocumentId)return null;
  const existing=await FinanceTransaction.findOne({collegeId,sourceModule,sourceDocumentId});
  if(existing)return existing;
  await ensureDefaults(collegeId,userId);
  const head=await FinanceHead.findOne({collegeId,type,code:String(headCode||'').toUpperCase(),isActive:true});
  const account=accountId?await FinanceAccount.findOne({_id:accountId,collegeId,isActive:true}):await resolveDefaultAccount(collegeId,paymentMethod,userId);
  if(!account)throw new Error('No active Finance account is available for posting.');
  const transactionNo=await nextTransactionNo(collegeId,type,transactionDate);
  return FinanceTransaction.create({collegeId,branchId:branchId||null,transactionNo,type,transactionDate:transactionDate||new Date(),headId:head?._id||null,accountId:account._id,amount:Number(amount),paymentMethod,sourceModule,sourceDocumentType,sourceDocumentId,sourceReference,description,payee,status:'posted',createdBy:userId,approvedBy:userId,approvedAt:new Date(),postedBy:userId,postedAt:new Date()});
}

function accountDeltas(tx){
  const amount=Number(tx.amount||0);const rows=[];
  if(tx.type==='income'||tx.type==='opening_balance')rows.push({accountId:String(tx.accountId),amount});
  else if(tx.type==='expense')rows.push({accountId:String(tx.accountId),amount:-amount});
  else if(tx.type==='transfer'){rows.push({accountId:String(tx.fromAccountId),amount:-amount});rows.push({accountId:String(tx.toAccountId),amount});}
  return rows;
}

module.exports={SYSTEM_HEADS,ensureDefaults,nextTransactionNo,resolveDefaultAccount,postSourceTransaction,accountDeltas};
