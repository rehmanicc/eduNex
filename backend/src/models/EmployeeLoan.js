const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  type:{type:String,enum:['advance','loan'],default:'advance'},
  principalAmount:{type:Number,min:0,required:true},
  approvedAmount:{type:Number,min:0,default:0},
  outstandingAmount:{type:Number,min:0,default:0},
  monthlyDeduction:{type:Number,min:0,default:0},
  startMonth:String,
  reason:String,
  status:{type:String,enum:['pending','approved','active','completed','rejected','cancelled'],default:'pending',index:true},
  approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  approvedAt:Date,
  recoveryHistory:{type:[new mongoose.Schema({
    payrollRecordId:{type:mongoose.Schema.Types.ObjectId,ref:'PayrollRecord',required:true},
    year:{type:Number,required:true},
    month:{type:Number,min:1,max:12,required:true},
    amount:{type:Number,min:0,required:true},
    recoveredAt:{type:Date,default:Date.now}
  },{_id:false})],default:[]}
},{timestamps:true});
schema.index({collegeId:1,employeeId:1,status:1,outstandingAmount:1});
module.exports=mongoose.model('EmployeeLoan',schema);
