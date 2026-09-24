const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  roomId:{type:mongoose.Schema.Types.ObjectId,ref:'HostelRoom',required:true,index:true},
  bedId:{type:mongoose.Schema.Types.ObjectId,required:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},

  checkInDate:{type:Date,default:Date.now},
  expectedCheckOutDate:Date,
  checkOutDate:Date,

  monthlyFee:{type:Number,min:0,default:0},
  securityDeposit:{type:Number,min:0,default:0},

  status:{type:String,enum:['reserved','active','checked_out','cancelled'],default:'active',index:true},
  assignedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  checkedOutBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  notes:String
},{timestamps:true});
schema.index({collegeId:1,studentId:1,status:1});
schema.index({collegeId:1,roomId:1,bedId:1,status:1});
// Optimization index for common operational queries.
schema.index({collegeId:1,status:1,hostelId:1,roomId:1});
module.exports=mongoose.model('HostelAssignment',schema);
