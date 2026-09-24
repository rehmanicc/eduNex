const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,unique:true,index:true},
  enforceCapacity:{type:Boolean,default:true},
  allowRouteChange:{type:Boolean,default:true},
  allowFeeOverride:{type:Boolean,default:true},
  maintenanceReminderDays:{type:Number,min:0,default:30},
  documentExpiryReminderDays:{type:Number,min:0,default:30}
},{timestamps:true});
module.exports=mongoose.model('TransportSettings',schema);
