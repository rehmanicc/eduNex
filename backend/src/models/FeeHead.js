const mongoose=require('mongoose');
const historySchema=new mongoose.Schema({action:String,at:{type:Date,default:Date.now},by:{type:mongoose.Schema.Types.ObjectId,ref:'User'},remarks:String,changes:mongoose.Schema.Types.Mixed},{_id:false});
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},code:{type:String,required:true,trim:true,uppercase:true},
  category:{type:String,enum:['tuition','admission','registration','exam','annual_fund','paper_fund','library','transport','hostel','fine','security','migration','other'],default:'other'},
  frequency:{type:String,enum:['one_time','monthly','term','semester','annual','as_applicable'],default:'one_time'},
  refundable:{type:Boolean,default:false},description:{type:String,trim:true},isActive:{type:Boolean,default:true},
  approvalStatus:{type:String,enum:['draft','pending_approval','approved','rejected','inactive'],default:'pending_approval',index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  submittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},submittedAt:Date,approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},approvedAt:Date,rejectedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},rejectedAt:Date,approvalRemarks:String,
  history:{type:[historySchema],default:[]}
},{timestamps:true});
schema.index({collegeId:1,code:1},{unique:true});
module.exports=mongoose.model('FeeHead',schema);
