const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  branchId:{type:mongoose.Schema.Types.ObjectId,ref:'Branch',default:null,index:true},
  transactionNo:{type:String,required:true},
  type:{type:String,enum:['income','expense','transfer','opening_balance','reversal'],required:true,index:true},
  transactionDate:{type:Date,required:true,default:Date.now,index:true},
  headId:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceHead',default:null,index:true},
  accountId:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceAccount',default:null,index:true},
  fromAccountId:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceAccount',default:null,index:true},
  toAccountId:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceAccount',default:null,index:true},
  amount:{type:Number,required:true,min:0.01},
  paymentMethod:{type:String,enum:['cash','bank_transfer','cheque','online','card','other'],default:'cash'},
  payee:{type:String,trim:true},
  referenceNo:{type:String,trim:true},
  description:{type:String,trim:true},
  attachmentUrl:{type:String,trim:true},
  sourceModule:{type:String,trim:true,index:true,default:'finance'},
  sourceDocumentType:{type:String,trim:true},
  sourceDocumentId:{type:mongoose.Schema.Types.ObjectId,default:null,index:true},
  sourceReference:{type:String,trim:true,index:true},
  status:{type:String,enum:['draft','pending_approval','approved','posted','reversed'],default:'draft',index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  submittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  submittedAt:Date,
  approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  approvedAt:Date,
  postedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  postedAt:Date,
  reversedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  reversedAt:Date,
  reversalOf:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceTransaction',default:null,index:true},
  reversalTransactionId:{type:mongoose.Schema.Types.ObjectId,ref:'FinanceTransaction',default:null},
  reversalReason:{type:String,trim:true}
},{timestamps:true});

schema.index({collegeId:1,transactionNo:1},{unique:true});
schema.index({collegeId:1,sourceModule:1,sourceDocumentId:1},{unique:true,partialFilterExpression:{sourceDocumentId:{$type:'objectId'}}});
module.exports=mongoose.model('FinanceTransaction',schema);
