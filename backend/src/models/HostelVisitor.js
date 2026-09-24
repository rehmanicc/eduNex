const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  visitorNo:{type:String,required:true},
  visitorName:{type:String,required:true,trim:true},
  cnic:{type:String,trim:true},
  mobileNo:{type:String,required:true,trim:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  roomId:{type:mongoose.Schema.Types.ObjectId,ref:'HostelRoom',required:true,index:true},
  relationship:String,
  purpose:String,
  checkInAt:{type:Date,default:Date.now,index:true},
  checkOutAt:Date,
  authorizedBy:String,
  remarks:String,
  status:{type:String,enum:['inside','checked_out'],default:'inside',index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({collegeId:1,visitorNo:1},{unique:true});
module.exports=mongoose.model('HostelVisitor',schema);
