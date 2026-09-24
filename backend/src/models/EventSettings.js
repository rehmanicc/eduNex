const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,unique:true,index:true},
  enabled:{type:Boolean,default:true},
  allowAttachments:{type:Boolean,default:true},
  allowScheduledEvents:{type:Boolean,default:true},
  defaultDurationHours:{type:Number,default:2,min:0.25,max:168},
  requireApprovalBeforePublishing:{type:Boolean,default:false},
  showEventsOnDashboard:{type:Boolean,default:true}
},{timestamps:true});
module.exports=mongoose.model('EventSettings',schema);
