const mongoose=require('mongoose');
const schema=new mongoose.Schema({collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},key:{type:String,required:true},value:{type:Number,default:0}},{timestamps:true});
schema.index({collegeId:1,key:1},{unique:true});
module.exports=mongoose.model('Sequence',schema);