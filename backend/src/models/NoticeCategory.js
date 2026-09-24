const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  isActive:{type:Boolean,default:true,index:true},
  isSystem:{type:Boolean,default:false}
},{timestamps:true});
schema.index({collegeId:1,name:1},{unique:true});
module.exports=mongoose.model('NoticeCategory',schema);
