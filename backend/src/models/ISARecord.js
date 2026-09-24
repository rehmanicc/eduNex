const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  category:{type:String,enum:['counselling','discipline','support','scholarship','activity','complaint','general'],default:'general',index:true},
  subject:{type:String,required:true,trim:true},
  details:String,
  status:{type:String,enum:['open','in_progress','resolved','closed'],default:'open',index:true},
  priority:{type:String,enum:['low','medium','high','urgent'],default:'medium'},
  assignedToEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  resolvedAt:Date,
  resolutionNotes:String,
  confidential:{type:Boolean,default:false}
},{timestamps:true});
module.exports=mongoose.model('ISARecord',schema);
