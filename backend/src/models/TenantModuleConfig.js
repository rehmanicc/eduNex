const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  module:{type:String,required:true,index:true},
  enabled:{type:Boolean,default:true,index:true},
  config:{type:mongoose.Schema.Types.Mixed,default:{}},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,module:1},{unique:true});
module.exports=mongoose.model('TenantModuleConfig',schema);
