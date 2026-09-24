const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 voucherNo:{type:String,required:true}, date:{type:Date,default:Date.now,index:true}, category:{type:String,required:true}, description:{type:String,required:true},
 amount:{type:Number,required:true,min:0.01}, method:{type:String,enum:['cash','bank','card','online','cheque','other'],default:'cash'}, reference:String,
 payee:String, createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 status:{type:String,enum:['draft','approved','paid','void'],default:'paid'}, notes:String
},{timestamps:true});
schema.index({collegeId:1,voucherNo:1},{unique:true});
module.exports=mongoose.model('Expense',schema);
