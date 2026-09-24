const { collegeIdFromRequest: cid, sendError: bad } = require('../../utils/request');
const LibraryBook = require('../../models/LibraryBook');
const LibraryBookCopy = require('../../models/LibraryBookCopy');
const LibraryIssue = require('../../models/LibraryIssue');
const LibraryReservation = require('../../models/LibraryReservation');
const LibrarySettings = require('../../models/LibrarySettings');
const Student = require('../../models/Student');
const Employee = require('../../models/Employee');
const { audit } = require('../../services/auditService');

function has(user,p){ return user?.systemRole==='platform_owner' || (user?.effectivePermissions||[]).includes('*') || (user?.effectivePermissions||[]).includes(p); }

async function settings(collegeId){
  return LibrarySettings.findOneAndUpdate(
    {collegeId},
    {$setOnInsert:{collegeId}},
    {new:true,upsert:true,setDefaultsOnInsert:true}
  );
}

function borrowerFromUser(user){
  if(user?.linkedStudentId) return {borrowerType:'student',studentId:user.linkedStudentId};
  if(user?.linkedEmployeeId) return {borrowerType:'employee',employeeId:user.linkedEmployeeId};
  return null;
}

function reservationScopeFromUser(user){
  if(user?.linkedStudentId) return {requesterType:'student',studentId:user.linkedStudentId};
  if(user?.linkedEmployeeId) return {requesterType:'employee',employeeId:user.linkedEmployeeId};
  return null;
}

async function promoteNextReservation(collegeId,bookId,copyId,s){
  const next=await LibraryReservation.findOne({
    collegeId,bookId,status:'waiting'
  }).sort({requestedAt:1});

  const copy=await LibraryBookCopy.findOne({_id:copyId,collegeId});
  if(!copy)return null;

  if(!next){
    copy.status='available';
    await copy.save();
    return null;
  }

  const holdUntil=new Date();
  holdUntil.setDate(holdUntil.getDate()+s.reservationHoldDays);
  next.status='ready';
  next.readyCopyId=copy._id;
  next.expiresAt=holdUntil;
  await next.save();

  copy.status='reserved';
  await copy.save();
  return next;
}

async function expireReadyReservations(collegeId,s){
  const expired=await LibraryReservation.find({
    collegeId,
    status:'ready',
    expiresAt:{$lte:new Date()}
  }).sort({requestedAt:1});

  for(const reservation of expired){
    const copyId=reservation.readyCopyId;
    reservation.status='expired';
    reservation.readyCopyId=null;
    await reservation.save();
    if(copyId) await promoteNextReservation(collegeId,reservation.bookId,copyId,s);
  }
}

async function validateBorrower(collegeId, type, id){
  if(type==='student'){
    const student=await Student.findOne({_id:id,collegeId,status:'active'}).select('_id').lean();
    return student ? {borrowerType:'student',studentId:student._id} : null;
  }
  if(type==='employee'){
    const employee=await Employee.findOne({_id:id,collegeId,isActive:true}).select('_id').lean();
    return employee ? {borrowerType:'employee',employeeId:employee._id} : null;
  }
  return null;
}

function applyFineStatus(issue){
  const amount=Math.max(0,Number(issue.fineAmount||0));
  const paid=Math.max(0,Number(issue.finePaid||0));
  const waived=Math.max(0,Number(issue.fineWaived||0));
  const settled=paid+waived;
  if(amount<=0) issue.fineStatus='none';
  else if(settled+0.001>=amount) issue.fineStatus=paid<=0&&waived>0?'waived':'paid';
  else if(settled>0) issue.fineStatus='partial';
  else issue.fineStatus='unpaid';
  return issue;
}

async function recalcOverdue(issue, s){
  if(!issue || !['issued','overdue'].includes(issue.status)) return issue;
  const now=new Date();
  if(now>issue.dueAt){
    const days=Math.max(1,Math.ceil((now-issue.dueAt)/(24*60*60*1000)));
    issue.status='overdue';
    issue.fineAmount=Number((days*(s.finePerDay||0)).toFixed(2));
    applyFineStatus(issue);
  }
  return issue;
}

function circulationSnapshot(issue){
  return [issue.status,Number(issue.fineAmount||0),Number(issue.finePaid||0),Number(issue.fineWaived||0),issue.fineStatus].join('|');
}

async function listBooks(req,res){
  const q={collegeId:cid(req),isActive:true};
  if(req.query.category) q.category=req.query.category;
  if(req.query.search){
    const escaped=String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const rx=new RegExp(escaped,'i');
    q.$or=[{bookCode:rx},{title:rx},{isbn:rx},{authors:rx},{subject:rx},{category:rx},{rack:rx},{shelf:rx}];
  }
  const books=await LibraryBook.find(q).sort({title:1}).lean();
  const counts=await LibraryBookCopy.aggregate([
    {$match:{collegeId:books[0]?.collegeId || null,bookId:{$in:books.map(b=>b._id)}}},
    {$group:{_id:'$bookId',total:{$sum:1},available:{$sum:{$cond:[{$eq:['$status','available']},1,0]}}}}
  ]);
  const map=new Map(counts.map(x=>[String(x._id),x]));
  res.json(books.map(b=>({...b,copies:map.get(String(b._id))||{total:0,available:0}})));
}

async function nextBookCode(collegeId){
  const last=await LibraryBook.findOne({collegeId,bookCode:/^BK\d{6}$/}).sort({bookCode:-1}).select('bookCode').lean();
  const n=last?.bookCode?Number(last.bookCode.slice(2))+1:1; return `BK${String(n).padStart(6,'0')}`;
}
async function nextAccession(collegeId){
  const last=await LibraryBookCopy.findOne({collegeId,accessionNo:/^ACC\d{7}$/}).sort({accessionNo:-1}).select('accessionNo').lean();
  const n=last?.accessionNo?Number(last.accessionNo.slice(3))+1:1; return `ACC${String(n).padStart(7,'0')}`;
}
async function createCopies(collegeId,bookId,quantity,extra={}){
  const docs=[]; let acc=await nextAccession(collegeId); let n=Number(acc.slice(3));
  for(let i=0;i<Math.max(0,Number(quantity||0));i++) docs.push({collegeId,bookId,accessionNo:`ACC${String(n+i).padStart(7,'0')}`,...extra});
  if(docs.length) await LibraryBookCopy.insertMany(docs); return docs.length;
}
async function createBook(req,res){
  const collegeId=cid(req); const quantity=Math.max(0,Number(req.body.quantity||0));
  const payload={...req.body,collegeId,bookCode:req.body.bookCode||await nextBookCode(collegeId)}; delete payload.quantity;
  if(!payload.shelfLocation) payload.shelfLocation=[payload.rack,payload.shelf].filter(Boolean).join(' / ');
  const doc=await LibraryBook.create(payload); await createCopies(collegeId,doc._id,quantity);
  await audit(req,'CREATE_LIBRARY_BOOK','LibraryBook',doc._id,{quantity}); res.status(201).json(doc);
}
async function importBooks(req,res){
  const rows=Array.isArray(req.body?.rows)?req.body.rows:[]; if(!rows.length)return bad(res,'No import rows supplied');
  const collegeId=cid(req); let created=0,copies=0; const errors=[];
  for(let i=0;i<rows.length;i++) try{
    const x=rows[i]||{}; const title=String(x.title||x.Title||'').trim(); if(!title) throw new Error('Title is required');
    const authors=String(x.authors||x.author||x.Author||x.Authors||'').split(/[,;]/).map(v=>v.trim()).filter(Boolean);
    const doc=await LibraryBook.create({collegeId,bookCode:await nextBookCode(collegeId),title,authors,isbn:x.isbn||x.ISBN||undefined,publisher:x.publisher||x.Publisher||undefined,edition:x.edition||x.Edition||undefined,publicationYear:Number(x.publicationYear||x['Publication Year'])||undefined,pages:Number(x.pages||x.Pages)||undefined,category:x.category||x.Category||undefined,rack:x.rack||x.Rack||undefined,shelf:x.shelf||x.Shelf||undefined,shelfLocation:[x.rack||x.Rack,x.shelf||x.Shelf].filter(Boolean).join(' / ')});
    const q=Math.max(0,Number(x.quantity||x.Quantity||1)); copies+=await createCopies(collegeId,doc._id,q); created++;
  }catch(e){errors.push({row:i+2,error:e.message});}
  await audit(req,'IMPORT_LIBRARY_BOOKS','LibraryBook',null,{created,copies,errors:errors.length}); res.json({created,copies,errors});
}

async function updateBook(req,res){
  const doc=await LibraryBook.findOneAndUpdate(
    {_id:req.params.id,collegeId:cid(req)},
    {$set:req.body},
    {new:true,runValidators:true}
  );
  if(!doc)return bad(res,'Book not found',404);
  await audit(req,'UPDATE_LIBRARY_BOOK','LibraryBook',doc._id);
  res.json(doc);
}

async function addCopy(req,res){
  const collegeId=cid(req);
  const book=await LibraryBook.findOne({_id:req.params.bookId,collegeId,isActive:true});
  if(!book)return bad(res,'Book not found',404);
  const payload={...req.body,collegeId,bookId:book._id}; if(!payload.accessionNo)payload.accessionNo=await nextAccession(collegeId);
  const copy=await LibraryBookCopy.create(payload);
  await audit(req,'ADD_LIBRARY_COPY','LibraryBookCopy',copy._id,{bookId:book._id});
  res.status(201).json(copy);
}

async function listCopies(req,res){
  const q={collegeId:cid(req)};
  if(req.query.bookId)q.bookId=req.query.bookId;
  if(req.query.status)q.status=req.query.status;
  res.json(await LibraryBookCopy.find(q).populate('bookId','title isbn authors').sort({accessionNo:1}));
}

async function searchBorrowers(req,res){
  const collegeId=cid(req), term=String(req.query.search||'').trim(); if(term.length<2)return res.json([]);
  const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), rx=new RegExp(escaped,'i');
  const [students,employees]=await Promise.all([
    Student.find({collegeId,status:'active',$or:[{name:rx},{admissionNo:rx},{registrationNo:rx}]}).select('name admissionNo registrationNo').limit(20).lean(),
    Employee.find({collegeId,isActive:true,$or:[{name:rx},{employeeNo:rx}]}).select('name employeeNo').limit(20).lean()
  ]);
  res.json([...students.map(x=>({_id:x._id,type:'student',name:x.name,code:x.admissionNo||x.registrationNo||''})),...employees.map(x=>({_id:x._id,type:'employee',name:x.name,code:x.employeeNo||''}))]);
}

async function listIssues(req,res){
  const collegeId=cid(req);
  const q={collegeId};
  const own=borrowerFromUser(req.user);
  if(!has(req.user,'VIEW_LIBRARY_REPORTS') && own) Object.assign(q,own);
  if(req.query.status)q.status=req.query.status;

  const s=await settings(collegeId);
  const docs=await LibraryIssue.find(q)
    .populate('bookId','title isbn')
    .populate('copyId','accessionNo barcode')
    .populate('studentId','name admissionNo registrationNo')
    .populate('employeeId','name employeeNo')
    .sort({issuedAt:-1});

  for(const issue of docs){
    const before=circulationSnapshot(issue);
    await recalcOverdue(issue,s);
    if(circulationSnapshot(issue)!==before) await issue.save();
  }
  res.json(docs);
}

async function issueBook(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  const {copyId,borrowerType,borrowerId}=req.body;
  const borrower=await validateBorrower(collegeId,borrowerType,borrowerId);
  if(!borrower)return bad(res,'Invalid borrower');

  const copy=await LibraryBookCopy.findOne({_id:copyId,collegeId}).populate('bookId');
  if(!copy)return bad(res,'Book copy not found',404);

  let readyReservation=null;
  if(copy.status==='reserved'){
    readyReservation=await LibraryReservation.findOne({
      collegeId,
      bookId:copy.bookId._id,
      readyCopyId:copy._id,
      status:'ready',
      ...borrower
    });
    if(!readyReservation)return bad(res,'Book copy is reserved for another borrower');
  } else if(copy.status!=='available'){
    return bad(res,'Book copy is not available');
  }

  if(!readyReservation){
    const borrowerReadyReservation=await LibraryReservation.findOne({
      collegeId,
      bookId:copy.bookId._id,
      status:'ready',
      ...borrower
    }).populate('readyCopyId','accessionNo');
    if(borrowerReadyReservation?.readyCopyId){
      return bad(res,`This borrower already has reserved copy ${borrowerReadyReservation.readyCopyId.accessionNo}. Issue that copy instead.`);
    }
  }

  const active=await LibraryIssue.countDocuments({
    collegeId,
    ...borrower,
    status:{$in:['issued','overdue']}
  });
  const limit=borrowerType==='student'?s.studentIssueLimit:s.employeeIssueLimit;
  if(active>=limit)return bad(res,`Borrower has reached issue limit (${limit})`);

  const days=borrowerType==='student'?s.studentLoanDays:s.employeeLoanDays;
  const dueAt=new Date();
  dueAt.setDate(dueAt.getDate()+days);

  const issue=await LibraryIssue.create({
    collegeId,bookId:copy.bookId._id,copyId:copy._id,...borrower,
    issuedAt:new Date(),dueAt,status:'issued',issuedBy:req.user._id
  });
  copy.status='issued'; await copy.save();

  readyReservation=readyReservation || await LibraryReservation.findOne({
    collegeId,bookId:copy.bookId._id,status:'ready',
    ...borrower
  });
  if(readyReservation){
    readyReservation.status='fulfilled';
    readyReservation.fulfilledIssueId=issue._id;
    await readyReservation.save();
  }

  await audit(req,'ISSUE_LIBRARY_BOOK','LibraryIssue',issue._id,{copyId,borrowerType,borrowerId});
  res.status(201).json(issue);
}

async function returnBook(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  const issue=await LibraryIssue.findOne({_id:req.params.issueId,collegeId});
  if(!issue)return bad(res,'Issue not found',404);
  if(issue.returnedAt)return bad(res,'Book already returned');

  await recalcOverdue(issue,s);
  issue.returnedAt=new Date();
  issue.returnedBy=req.user._id;

  const returnCondition=String(req.body.condition||'good').toLowerCase();
  if(!['good','damaged','lost'].includes(returnCondition))return bad(res,'Invalid return condition');
  if(returnCondition==='lost'){
    issue.status='lost';
  } else if(returnCondition==='damaged'){
    issue.status='damaged';
  } else {
    issue.status='returned';
  }
  await issue.save();

  const copy=await LibraryBookCopy.findOne({_id:issue.copyId,collegeId});
  if(copy){
    copy.condition=returnCondition==='lost'?'lost':returnCondition==='damaged'?'damaged':copy.condition;
    copy.status=returnCondition==='lost'?'lost':returnCondition==='damaged'?'damaged':'available';
    await copy.save();

    if(copy.status==='available'){
      await promoteNextReservation(collegeId,issue.bookId,copy._id,s);
    }
  }

  await audit(req,'RETURN_LIBRARY_BOOK','LibraryIssue',issue._id,{condition:returnCondition});
  res.json(issue);
}

async function renewIssue(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  const issue=await LibraryIssue.findOne({_id:req.params.issueId,collegeId});
  if(!issue)return bad(res,'Issue not found',404);
  if(!['issued','overdue'].includes(issue.status))return bad(res,'Issue cannot be renewed');
  if(issue.renewalCount>=s.maxRenewals)return bad(res,'Maximum renewals reached');

  const reserved=await LibraryReservation.exists({collegeId,bookId:issue.bookId,status:{$in:['waiting','ready']}});
  if(reserved)return bad(res,'Book has an active reservation and cannot be renewed');

  await recalcOverdue(issue,s);
  if(issue.fineStatus==='unpaid'||issue.fineStatus==='partial')return bad(res,'Outstanding fine must be settled before renewal');

  const base=new Date(Math.max(Date.now(),new Date(issue.dueAt).getTime()));
  base.setDate(base.getDate()+s.renewalDays);
  issue.dueAt=base;
  issue.status='issued';
  issue.renewalCount+=1;
  await issue.save();
  await audit(req,'RENEW_LIBRARY_ISSUE','LibraryIssue',issue._id);
  res.json(issue);
}

async function reserveBook(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  await expireReadyReservations(collegeId,s);
  const own=borrowerFromUser(req.user);
  const borrower=own || await validateBorrower(collegeId,req.body.requesterType,req.body.requesterId);
  if(!borrower)return bad(res,'Invalid requester');

  if(borrower.borrowerType==='student' && !s.allowStudentReservation)return bad(res,'Student reservations are disabled');
  if(borrower.borrowerType==='employee' && !s.allowEmployeeReservation)return bad(res,'Employee reservations are disabled');

  const book=await LibraryBook.findOne({_id:req.params.bookId,collegeId,isActive:true});
  if(!book)return bad(res,'Book not found',404);

  const existing=await LibraryReservation.exists({
    collegeId,
    bookId:book._id,
    status:{$in:['waiting','ready']},
    ...borrower
  });
  if(existing)return bad(res,'Borrower already has an active reservation for this book');

  const available=await LibraryBookCopy.findOne({collegeId,bookId:book._id,status:'available'});
  const doc=await LibraryReservation.create({
    collegeId,bookId:book._id,
    requesterType:borrower.borrowerType,
    studentId:borrower.studentId,
    employeeId:borrower.employeeId,
    status:available?'ready':'waiting',
    readyCopyId:available?available._id:null,
    expiresAt:available?new Date(Date.now()+s.reservationHoldDays*86400000):null
  });
  if(available){available.status='reserved';await available.save();}
  await audit(req,'RESERVE_LIBRARY_BOOK','LibraryReservation',doc._id,{bookId:book._id});
  res.status(201).json(doc);
}

async function listReservations(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  await expireReadyReservations(collegeId,s);
  const q={collegeId};
  const own=reservationScopeFromUser(req.user);
  if(!has(req.user,'VIEW_LIBRARY_REPORTS') && own) Object.assign(q,own);
  if(req.query.status)q.status=req.query.status;

  const docs=await LibraryReservation.find(q)
    .populate('bookId','title isbn')
    .populate('readyCopyId','accessionNo')
    .populate('studentId','name admissionNo registrationNo')
    .populate('employeeId','name employeeNo')
    .sort({requestedAt:1});
  res.json(docs);
}

async function cancelReservation(req,res){
  const collegeId=cid(req);
  const reservation=await LibraryReservation.findOne({_id:req.params.id,collegeId});
  if(!reservation)return bad(res,'Reservation not found',404);

  const own=borrowerFromUser(req.user);
  if(!has(req.user,'MANAGE_LIBRARY') && own){
    const matches=(own.studentId&&String(own.studentId)===String(reservation.studentId)) ||
      (own.employeeId&&String(own.employeeId)===String(reservation.employeeId));
    if(!matches)return bad(res,'Access denied',403);
  }
  if(!['waiting','ready'].includes(reservation.status))return bad(res,'Reservation cannot be cancelled');

  const readyCopyId=reservation.readyCopyId;
  reservation.status='cancelled';
  reservation.readyCopyId=null;
  await reservation.save();
  if(readyCopyId){
    const s=await settings(collegeId);
    await promoteNextReservation(collegeId,reservation.bookId,readyCopyId,s);
  }
  await audit(req,'CANCEL_LIBRARY_RESERVATION','LibraryReservation',reservation._id);
  res.json(reservation);
}

async function settleFine(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  const issue=await LibraryIssue.findOne({_id:req.params.issueId,collegeId});
  if(!issue)return bad(res,'Issue not found',404);
  await recalcOverdue(issue,s);

  const pay=Math.max(0,Number(req.body.payAmount||0));
  const waive=Math.max(0,Number(req.body.waiveAmount||0));
  const remaining=Math.max(0,issue.fineAmount-(issue.finePaid||0)-(issue.fineWaived||0));
  if(pay+waive>remaining+0.001)return bad(res,'Settlement exceeds outstanding fine');

  if(pay<=0&&waive<=0)return bad(res,'Enter a payment or waiver amount');
  issue.finePaid=Number(((issue.finePaid||0)+pay).toFixed(2));
  issue.fineWaived=Number(((issue.fineWaived||0)+waive).toFixed(2));
  applyFineStatus(issue);
  await issue.save();

  await audit(req,'SETTLE_LIBRARY_FINE','LibraryIssue',issue._id,{payAmount:pay,waiveAmount:waive});
  res.json(issue);
}

async function getSettings(req,res){
  res.json(await settings(cid(req)));
}
async function updateSettings(req,res){
  const collegeId=cid(req);
  const doc=await LibrarySettings.findOneAndUpdate(
    {collegeId},
    {$set:req.body},
    {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
  );
  await audit(req,'UPDATE_LIBRARY_SETTINGS','LibrarySettings',doc._id);
  res.json(doc);
}

async function dashboard(req,res){
  const collegeId=cid(req);
  const s=await settings(collegeId);
  await expireReadyReservations(collegeId,s);
  const active=await LibraryIssue.find({collegeId,status:{$in:['issued','overdue']}});
  const overdueUpdates=[];
  for(const x of active){
    const before=circulationSnapshot(x);
    await recalcOverdue(x,s);
    if(circulationSnapshot(x)!==before){
      overdueUpdates.push({updateOne:{filter:{_id:x._id,collegeId},update:{$set:{status:x.status,fineAmount:x.fineAmount,fineStatus:x.fineStatus}}}});
    }
  }
  if(overdueUpdates.length)await LibraryIssue.bulkWrite(overdueUpdates,{ordered:false});
  const [titles,copies,available,issued,overdue,reservations,unpaidFine] = await Promise.all([
    LibraryBook.countDocuments({collegeId,isActive:true}),
    LibraryBookCopy.countDocuments({collegeId,status:{$ne:'withdrawn'}}),
    LibraryBookCopy.countDocuments({collegeId,status:'available'}),
    LibraryIssue.countDocuments({collegeId,status:'issued'}),
    LibraryIssue.countDocuments({collegeId,status:'overdue'}),
    LibraryReservation.countDocuments({collegeId,status:{$in:['waiting','ready']}}),
    LibraryIssue.aggregate([
      {$match:{collegeId,status:{$in:['issued','overdue','returned']}}},
      {$group:{_id:null,total:{$sum:{$max:[0,{$subtract:['$fineAmount',{$add:['$finePaid','$fineWaived']}]}]}}}}
    ])
  ]);
  res.json({
    titles,copies,available,issued,overdue,reservations,
    outstandingFine:unpaidFine[0]?.total||0
  });
}

module.exports={
  listBooks,createBook,updateBook,importBooks,addCopy,listCopies,searchBorrowers,
  listIssues,issueBook,returnBook,renewIssue,
  reserveBook,listReservations,cancelReservation,
  settleFine,getSettings,updateSettings,dashboard
};
