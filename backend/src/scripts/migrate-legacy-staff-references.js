require('dotenv').config();
const mongoose=require('mongoose');
const Inquiry=require('../models/Inquiry');
const AdmissionApplication=require('../models/AdmissionApplication');

async function run(){
  const uri=process.env.MONGO_URI||process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/college_management';
  await mongoose.connect(uri);

  const legacyInquiryFilter={referenceType:'staff',$or:[{referenceStaffId:{$exists:false}},{referenceStaffId:null}]};
  const legacyApplicationFilter={referenceType:'staff',$or:[{referenceStaffId:{$exists:false}},{referenceStaffId:null}]};

  const [inquiryCount,applicationCount]=await Promise.all([
    Inquiry.countDocuments(legacyInquiryFilter),
    AdmissionApplication.countDocuments(legacyApplicationFilter)
  ]);
  console.log(`Legacy free-text Staff inquiries: ${inquiryCount}`);
  console.log(`Legacy free-text Staff admission applications: ${applicationCount}`);

  const [inquiries,applications]=await Promise.all([
    Inquiry.updateMany(legacyInquiryFilter,{$set:{referenceType:'student'},$unset:{referenceStaffId:''}}),
    AdmissionApplication.updateMany(legacyApplicationFilter,{$set:{referenceType:'student'},$unset:{referenceStaffId:''}})
  ]);

  console.log(`Updated inquiries: ${inquiries.modifiedCount||0}`);
  console.log(`Updated admission applications: ${applications.modifiedCount||0}`);
  console.log('Existing referenceDetail values were preserved unchanged.');
  await mongoose.disconnect();
}
run().catch(async err=>{console.error(err);try{await mongoose.disconnect();}catch{}process.exit(1);});
