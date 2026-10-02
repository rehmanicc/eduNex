const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  examId:{type:mongoose.Schema.Types.ObjectId,ref:'Exam',required:true,index:true},
  examResultId:{type:mongoose.Schema.Types.ObjectId,ref:'ExamResult',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  sectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section',required:true,index:true},
  courseId:{type:mongoose.Schema.Types.ObjectId,ref:'Course',required:true,index:true},
  revision:{type:Number,required:true,min:1},
  reason:{type:String,required:true,enum:['Data Entry Error','Marks Calculation','Unchecked Questions','Incorrect Checking'],index:true},
  oldMarks:{type:Number,default:null},newMarks:{type:Number,default:null},marksDifference:{type:Number,default:0},
  oldPercentage:{type:Number,default:0},newPercentage:{type:Number,default:0},
  oldGrade:{type:String,default:''},newGrade:{type:String,default:''},
  oldStatus:{type:String,default:''},newStatus:{type:String,default:''},
  oldOverall:{totalMarks:Number,obtainedMarks:Number,percentage:Number,grade:String,status:String},
  newOverall:{totalMarks:Number,obtainedMarks:Number,percentage:Number,grade:String,status:String},
  changedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  changedAt:{type:Date,default:Date.now,index:true}
},{timestamps:true});
schema.index({collegeId:1,examId:1,studentId:1,revision:1});
schema.index({collegeId:1,examId:1,changedAt:-1});
schema.index({collegeId:1,sectionId:1,courseId:1,reason:1,changedAt:-1});
module.exports=mongoose.model('ResultCorrection',schema);
