const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,unique:true,index:true},
  enabled:{type:Boolean,default:true},
  salaryCalculationDay:{type:Number,min:1,max:31,default:30},
  attendanceDeductionEnabled:{type:Boolean,default:false},
  perDayDeductionMethod:{type:String,enum:['30_days','working_days'],default:'30_days'},
  allowPartialPayment:{type:Boolean,default:true},
  requireApproval:{type:Boolean,default:true},
  payslipFooter:{type:String,trim:true,default:''},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

module.exports=mongoose.model('PayrollSettings',schema);
