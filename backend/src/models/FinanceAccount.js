const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  branchId:{type:mongoose.Schema.Types.ObjectId,ref:'Branch',default:null,index:true},
  name:{type:String,required:true,trim:true},
  type:{type:String,enum:['cash','bank','petty_cash'],required:true,index:true},
  bankName:{type:String,trim:true},
  accountNumber:{type:String,trim:true},
  bankBranch:{type:String,trim:true},
  openingBalance:{type:Number,default:0},
  openingDate:{type:Date,default:Date.now},
  isSystem:{type:Boolean,default:false},
  isActive:{type:Boolean,default:true,index:true},
  description:{type:String,trim:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,name:1},{unique:true});
module.exports=mongoose.model('FinanceAccount',schema);
