const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},
  programId:{type:mongoose.Schema.Types.ObjectId,ref:'Program',required:true,index:true},
  sectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section',required:true,index:true},
  semester:{type:Number,min:1,required:true},
  rollNo:String,
  status:{type:String,enum:['active','completed','promoted','transferred','withdrawn','suspended','graduated'],default:'active',index:true},
  startedAt:{type:Date,default:Date.now}, endedAt:Date,
  reason:String, createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({collegeId:1,studentId:1,academicSessionId:1,semester:1},{unique:true});
module.exports=mongoose.model('StudentEnrollment',schema);