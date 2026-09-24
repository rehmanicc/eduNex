const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
 feeHeadId:{type:mongoose.Schema.Types.ObjectId,ref:'FeeHead'},
 name:{type:String,required:true}, type:{type:String,enum:['fixed','percentage'],required:true}, value:{type:Number,required:true,min:0},
 validFrom:Date, validTo:Date, reason:String, approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, isActive:{type:Boolean,default:true}
},{timestamps:true});
module.exports=mongoose.model('FeeConcession',schema);
