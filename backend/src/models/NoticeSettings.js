const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,unique:true,index:true},
  enabled:{type:Boolean,default:true},
  allowScheduledPublishing:{type:Boolean,default:true},
  requireExpiryDate:{type:Boolean,default:false},
  allowAttachments:{type:Boolean,default:true},
  defaultValidityDays:{type:Number,default:30,min:1,max:3650},
  allowEmployeesToCreate:{type:Boolean,default:false},
  requireApprovalBeforePublishing:{type:Boolean,default:false}
},{timestamps:true});
module.exports=mongoose.model('NoticeSettings',schema);
