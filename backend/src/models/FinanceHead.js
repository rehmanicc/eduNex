const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  type:{type:String,enum:['income','expense'],required:true,index:true},
  code:{type:String,required:true,trim:true,uppercase:true},
  name:{type:String,required:true,trim:true},
  isSystem:{type:Boolean,default:false},
  isActive:{type:Boolean,default:true,index:true},
  description:{type:String,trim:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,type:1,code:1},{unique:true});
module.exports=mongoose.model('FinanceHead',schema);
