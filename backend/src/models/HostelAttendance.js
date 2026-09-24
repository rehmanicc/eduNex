const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  roomId:{type:mongoose.Schema.Types.ObjectId,ref:'HostelRoom',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  date:{type:Date,required:true,index:true},
  status:{type:String,enum:['present','absent','leave','night_out'],default:'present',index:true},
  inTime:String,
  outTime:String,
  remarks:String,
  markedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({collegeId:1,studentId:1,date:1},{unique:true});
module.exports=mongoose.model('HostelAttendance',schema);
