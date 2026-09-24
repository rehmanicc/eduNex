const mongoose = require('mongoose');
const bandSchema = new mongoose.Schema({
  minPercentage:{type:Number,min:0,max:100,required:true},
  maxPercentage:{type:Number,min:0,max:100,required:true},
  grade:{type:String,required:true,trim:true},
  gradePoint:{type:Number,min:0,default:0},
  remarks:{type:String,trim:true}
},{_id:false});
const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  isDefault:{type:Boolean,default:false,index:true},
  bands:{type:[bandSchema],default:[]},
  isActive:{type:Boolean,default:true}
},{timestamps:true});
schema.index({collegeId:1,name:1},{unique:true});
module.exports=mongoose.model('GradingScheme',schema);
