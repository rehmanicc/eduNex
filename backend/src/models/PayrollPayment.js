const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  payrollRecordId:{type:mongoose.Schema.Types.ObjectId,ref:'PayrollRecord',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  amount:{type:Number,min:0.01,required:true},
  paymentDate:{type:Date,required:true,default:Date.now,index:true},
  paymentMethod:{type:String,enum:['cash','bank','cheque','online'],default:'bank'},
  referenceNo:{type:String,trim:true,default:''},
  remarks:{type:String,trim:true,default:''},
  financeAccountId:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceAccount',default:null},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,payrollRecordId:1,paymentDate:1});
module.exports=mongoose.model('PayrollPayment',schema);
