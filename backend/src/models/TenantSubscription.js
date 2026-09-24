const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,unique:true,index:true},
  planId:{type:mongoose.Schema.Types.ObjectId,ref:'SubscriptionPlan',required:true,index:true},
  billingCycle:{type:String,enum:['monthly','annual','custom'],default:'monthly'},
  startDate:{type:Date,default:Date.now},
  endDate:Date,
  status:{type:String,enum:['trial','active','past_due','suspended','cancelled','expired'],default:'trial',index:true},
  customPrice:{type:Number,min:0},
  notes:String,
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

module.exports=mongoose.model('TenantSubscription',schema);
