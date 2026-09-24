const mongoose = require('mongoose');
const schema = new mongoose.Schema({ collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true}, name:{type:String,required:true}, code:String, headEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee'} },{timestamps:true});
schema.index({collegeId:1,name:1},{unique:true}); module.exports=mongoose.model('Department',schema);
