const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  code:{type:String,required:true,trim:true,uppercase:true},
  weightage:{type:Number,min:0,max:100,default:100},
  isActive:{type:Boolean,default:true}
},{timestamps:true});
schema.index({collegeId:1,code:1},{unique:true});
module.exports=mongoose.model('ExamType',schema);
