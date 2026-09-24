const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  branchId:{type:mongoose.Schema.Types.ObjectId,ref:'Branch',default:null,index:true},
  name:{type:String,required:true,trim:true},
  code:{type:String,trim:true},
  capacity:{type:Number,min:1,default:40},
  isActive:{type:Boolean,default:true}
},{timestamps:true});
schema.index({collegeId:1,name:1},{unique:true});
module.exports=mongoose.model('TimetableRoom',schema);
