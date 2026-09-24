const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  module:{type:String,required:true,index:true},
  reportType:{type:String,required:true},
  filters:{type:mongoose.Schema.Types.Mixed,default:{}},
  columns:{type:[String],default:[]},
  isShared:{type:Boolean,default:false},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true}
},{timestamps:true});
module.exports=mongoose.model('SavedReport',schema);
