const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  examId:{type:mongoose.Schema.Types.ObjectId,ref:'Exam',required:true,index:true},
  scheduleId:{type:mongoose.Schema.Types.ObjectId,ref:'ExamSchedule',required:true,index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
  sectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section',required:true,index:true},
  courseId:{type:mongoose.Schema.Types.ObjectId,ref:'Course',required:true,index:true},
  marksObtained:{type:Number,min:0,default:null},
  totalMarks:{type:Number,min:1,required:true},
  percentage:{type:Number,min:0,max:100},
  grade:String,
  gradePoint:{type:Number,min:0,default:0},
  resultStatus:{type:String,enum:['pending','pass','fail','absent','withheld'],default:'pending',index:true},
  remarks:String,
  enteredBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  enteredAt:Date,
  verifiedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  verifiedAt:Date,
  publishedAt:Date
},{timestamps:true});
schema.index({collegeId:1,scheduleId:1,studentId:1},{unique:true});
// Supports compile/verification counts without scanning unrelated exam results.
schema.index({collegeId:1,scheduleId:1,resultStatus:1});
module.exports=mongoose.model('ExamResult',schema);
