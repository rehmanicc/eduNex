const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  type:{type:String,enum:['admitted','enrolled','promoted','section_transferred','class_transferred','suspended','reactivated','withdrawn','dropped','graduated','alumni'],required:true,index:true},
  fromAcademicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession'}, toAcademicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession'},
  fromSectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section'}, toSectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section'},
  fromSemester:Number, toSemester:Number, reason:String, effectiveDate:{type:Date,default:Date.now},
  performedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, metadata:{type:mongoose.Schema.Types.Mixed,default:{}}
},{timestamps:true});
module.exports=mongoose.model('StudentLifecycleEvent',schema);