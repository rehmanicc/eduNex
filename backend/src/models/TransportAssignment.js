const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  routeId:{type:mongoose.Schema.Types.ObjectId,ref:'TransportRoute',required:true,index:true},
  stopId:{type:mongoose.Schema.Types.ObjectId,required:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},
  startDate:{type:Date,default:Date.now},
  endDate:Date,
  monthlyFee:{type:Number,min:0,default:0},
  pickupType:{type:String,enum:['both','pickup','drop'],default:'both'},
  notes:String,
  status:{type:String,enum:['active','paused','ended'],default:'active',index:true},
  assignedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({collegeId:1,studentId:1,academicSessionId:1,status:1});
// Optimization index for common operational queries.
schema.index({collegeId:1,status:1,routeId:1});
module.exports=mongoose.model('TransportAssignment',schema);
