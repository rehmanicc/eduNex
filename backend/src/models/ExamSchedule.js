const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  examId:{type:mongoose.Schema.Types.ObjectId,ref:'Exam',required:true,index:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},
  programId:{type:mongoose.Schema.Types.ObjectId,ref:'Program',required:true,index:true},
  sectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section',required:true,index:true},
  courseId:{type:mongoose.Schema.Types.ObjectId,ref:'Course',required:true,index:true},
  teacherAssignmentId:{type:mongoose.Schema.Types.ObjectId,ref:'TeacherAssignment',default:null,index:true},
  examDate:{type:Date,required:true,index:true},
  startTime:{type:String,required:true},
  endTime:{type:String,default:'',trim:true},
  room:{type:String,trim:true},
  totalMarks:{type:Number,min:1,required:true,default:100},
  passingMarks:{type:Number,min:0,required:true,default:40},
  isPublished:{type:Boolean,default:false},
  marksVerifiedAt:Date,
  marksVerifiedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  notes:{type:String,trim:true}
},{timestamps:true});
schema.index({collegeId:1,examId:1,sectionId:1,courseId:1},{unique:true});
module.exports=mongoose.model('ExamSchedule',schema);
