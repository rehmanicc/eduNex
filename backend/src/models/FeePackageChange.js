const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  feePackageId:{type:mongoose.Schema.Types.ObjectId,ref:'FeePackage',required:true,index:true},
  fromVersion:{type:Number,required:true},
  toVersion:{type:Number,required:true},
  before:{type:mongoose.Schema.Types.Mixed,required:true},
  after:{type:mongoose.Schema.Types.Mixed,required:true},
  reason:{type:String,required:true,trim:true},
  changedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
module.exports=mongoose.model('FeePackageChange',schema);
