const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  type:{type:String,default:'general'},
  title:{type:String,required:true},
  message:{type:String,required:true},
  entityType:String,
  entityId:mongoose.Schema.Types.ObjectId,
  isRead:{type:Boolean,default:false,index:true},
  readAt:Date
},{timestamps:true});
schema.index({collegeId:1,userId:1,createdAt:-1});
module.exports=mongoose.model('Notification',schema);
