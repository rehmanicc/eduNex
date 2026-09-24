const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  name:{type:String,required:true,trim:true},
  monthlyFee:{type:Number,min:0,default:0},
  meals:{type:[String],default:['breakfast','lunch','dinner']},
  isActive:{type:Boolean,default:true,index:true}
},{timestamps:true});
schema.index({collegeId:1,hostelId:1,name:1},{unique:true});
module.exports=mongoose.model('HostelMessPlan',schema);
