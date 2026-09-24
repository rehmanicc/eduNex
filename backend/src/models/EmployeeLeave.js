const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  leaveType:{type:String,enum:['casual','sick','annual','unpaid','maternity','paternity','other'],default:'casual'},
  startDate:{type:Date,required:true,index:true},
  endDate:{type:Date,required:true,index:true},
  days:{type:Number,min:0.5,required:true},
  reason:String,
  status:{type:String,enum:['pending','approved','rejected','cancelled'],default:'pending',index:true},
  requestedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  decidedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  decidedAt:Date,
  decisionNotes:String
},{timestamps:true});
schema.index({collegeId:1,employeeId:1,status:1,leaveType:1,startDate:1,endDate:1});
module.exports=mongoose.model('EmployeeLeave',schema);
