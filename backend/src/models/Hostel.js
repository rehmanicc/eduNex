const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  branchId:{type:mongoose.Schema.Types.ObjectId,ref:'Branch',required:true,index:true},
  name:{type:String,required:true,trim:true},
  code:{type:String,required:true,trim:true,uppercase:true},
  hostelType:{type:String,enum:['boys','girls','staff','mixed'],default:'boys',index:true},
  address:String,
  wardenEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',index:true},
  assistantWardenEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',index:true},
  contactPhone:String,
  notes:String,
  isActive:{type:Boolean,default:true,index:true}
},{timestamps:true});
schema.index({collegeId:1,code:1},{unique:true});
schema.index({collegeId:1,branchId:1,name:1},{unique:true});
module.exports=mongoose.model('Hostel',schema);
