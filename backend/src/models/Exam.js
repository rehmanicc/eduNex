const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  code:{type:String,trim:true},
  examTypeId:{type:mongoose.Schema.Types.ObjectId,ref:'ExamType',index:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},
  gradingSchemeId:{type:mongoose.Schema.Types.ObjectId,ref:'GradingScheme'},
  startDate:{type:Date,required:true},
  endDate:{type:Date,required:true},
  status:{type:String,enum:['draft','scheduled','marks_entry','compiled','published','closed'],default:'draft',index:true},
  publishedAt:Date,
  publishedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  notes:String
},{timestamps:true});
schema.index({collegeId:1,academicSessionId:1,name:1},{unique:true});
module.exports=mongoose.model('Exam',schema);
