const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  year:{type:Number,required:true,index:true},
  month:{type:Number,min:1,max:12,required:true,index:true},
  type:{type:String,enum:['bonus','allowance','deduction','fine','advance','loan_recovery','other'],required:true},
  amount:{type:Number,min:0,required:true},
  reason:{type:String,trim:true,required:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,employeeId:1,year:1,month:1});
module.exports=mongoose.model('PayrollAdjustment',schema);
