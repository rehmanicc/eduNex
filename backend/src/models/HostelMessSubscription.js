const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  messPlanId:{type:mongoose.Schema.Types.ObjectId,ref:'HostelMessPlan',required:true,index:true},
  startDate:{type:Date,default:Date.now},
  endDate:Date,
  monthlyFee:{type:Number,min:0,default:0},
  status:{type:String,enum:['active','paused','ended'],default:'active',index:true}
},{timestamps:true});
schema.index({collegeId:1,studentId:1,status:1});
module.exports=mongoose.model('HostelMessSubscription',schema);
