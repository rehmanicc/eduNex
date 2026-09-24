const mongoose=require('mongoose');
const feeHeadSchema=new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  code:{type:String,trim:true},
  amount:{type:Number,required:true,min:0}
},{_id:true});
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  programId:{type:mongoose.Schema.Types.ObjectId,ref:'Program',required:true,index:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},
  feeHeads:{type:[feeHeadSchema],default:[]},
  totalAmount:{type:Number,min:0,default:0},
  version:{type:Number,min:1,default:1},
  isLocked:{type:Boolean,default:false,index:true},
  lockedAt:Date,
  lockedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  lockReason:String,
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  isActive:{type:Boolean,default:true}
},{timestamps:true});
schema.index({collegeId:1,name:1,programId:1,academicSessionId:1},{unique:true});
schema.pre('validate',function(next){
  this.totalAmount=(this.feeHeads||[]).reduce((s,h)=>s+Number(h.amount||0),0);
  next();
});
module.exports=mongoose.model('FeePackage',schema);
