const mongoose=require('mongoose');

const allocationSchema=new mongoose.Schema({
  postingId:{type:mongoose.Schema.Types.ObjectId,ref:'FeePosting',required:true},
  lineId:{type:mongoose.Schema.Types.ObjectId,required:true},
  feeHeadCode:{type:String,required:true,trim:true,uppercase:true},
  amount:{type:Number,required:true,min:0.01}
},{_id:false});

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  admissionApplicationId:{type:mongoose.Schema.Types.ObjectId,ref:'AdmissionApplication',required:true,index:true},
  studentFeePlanId:{type:mongoose.Schema.Types.ObjectId,ref:'StudentFeePlan',required:true,index:true},
  installmentId:{type:mongoose.Schema.Types.ObjectId},
  receiptNo:{type:String,required:true},
  amount:{type:Number,required:true,min:0.01},
  allocations:{type:[allocationSchema],default:[]},
  paymentDate:{type:Date,default:Date.now},
  paymentMethod:{type:String,enum:['cash','bank','card','online','cheque','other'],default:'cash'},
  // Bank challan / deposit slip number used when the voucher payment is posted.
  challanNo:{type:String,trim:true,index:true},
  referenceNo:String,
  remarks:String,
  postedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  isReversed:{type:Boolean,default:false,index:true},
  reversedAt:Date,
  reversedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  reversalReason:String
},{timestamps:true});
schema.index({collegeId:1,receiptNo:1},{unique:true});
schema.index({collegeId:1,studentFeePlanId:1,isReversed:1,paymentDate:-1});
module.exports=mongoose.model('FeePayment',schema);
