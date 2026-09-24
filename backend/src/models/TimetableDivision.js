const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},
 sectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section',required:true,index:true},
 name:{type:String,required:true,trim:true},
 code:{type:String,trim:true},
 isActive:{type:Boolean,default:true,index:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({collegeId:1,academicSessionId:1,sectionId:1,name:1},{unique:true});
module.exports=mongoose.model('TimetableDivision',schema);
