require('dotenv').config();
const mongoose=require('mongoose');
const AdmissionApplication=require('../models/AdmissionApplication');
const Inquiry=require('../models/Inquiry');
const AcademicSession=require('../models/AcademicSession');
const College=require('../models/College');
const seq=require('../services/sequenceService');
const {sessionYear}=require('../services/rollNumberService');

async function nextFormNo(collegeId,session){
  const year=sessionYear(session);
  const n=await seq.nextNumber(collegeId,`admission-form-${year}`);
  return `F${String(year).slice(-2)}${String(n).padStart(4,'0')}`;
}

async function main(){
  const uri=process.env.MONGO_URI||process.env.MONGODB_URI;
  if(!uri)throw new Error('MONGO_URI / MONGODB_URI is not configured');
  await mongoose.connect(uri);

  const colleges=await College.find({}).select('_id name').lean();
  if(colleges.length!==1){
    throw new Error(`Expected exactly one configured college, found ${colleges.length}.`);
  }
  const college=colleges[0];
  const rows=await AdmissionApplication.find({
    collegeId:college._id,
    $or:[{formNo:{$exists:false}},{formNo:null},{formNo:''}]
  }).sort({createdAt:1});

  let assigned=0,skipped=0;
  for(const row of rows){
    let sessionId=row.academicSessionId;
    if(!sessionId){
      const inquiry=await Inquiry.findById(row.inquiryId).select('academicSessionId');
      sessionId=inquiry?.academicSessionId;
    }
    if(!sessionId){
      console.log(`SKIP ${row.studentName}: no Academic Session on admission/inquiry`);
      skipped++;
      continue;
    }
    const session=await AcademicSession.findOne({_id:sessionId,collegeId:college._id});
    if(!session){
      console.log(`SKIP ${row.studentName}: Academic Session not found`);
      skipped++;
      continue;
    }
    row.academicSessionId=session._id;
    row.formNo=await nextFormNo(college._id,session);
    await row.save();
    console.log(`${row.formNo}  ${row.studentName}`);
    assigned++;
  }

  console.log(`\nCollege: ${college.name}`);
  console.log(`Assigned missing Form Nos: ${assigned}`);
  console.log(`Skipped: ${skipped}`);
}

main().then(()=>mongoose.disconnect()).then(()=>process.exit(0)).catch(async err=>{
  console.error('Form No repair failed:',err);
  try{await mongoose.disconnect();}catch{}
  process.exit(1);
});
