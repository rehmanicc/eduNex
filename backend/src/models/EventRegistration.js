const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  eventId:{type:mongoose.Schema.Types.ObjectId,ref:'Event',required:true,index:true},
  participantType:{type:String,enum:['student','employee'],required:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',index:true},
  status:{type:String,enum:['registered','attended','cancelled','absent'],default:'registered',index:true},
  registeredAt:{type:Date,default:Date.now},
  checkedInAt:Date
},{timestamps:true});
schema.index({collegeId:1,eventId:1,studentId:1},{unique:true,sparse:true});
schema.index({collegeId:1,eventId:1,employeeId:1},{unique:true,sparse:true});
module.exports=mongoose.model('EventRegistration',schema);
