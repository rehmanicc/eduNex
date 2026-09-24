const mongoose=require('mongoose');

const resultSchema=new mongoose.Schema({
  level:{type:String,required:true,trim:true},
  obtainedMarks:{type:Number,min:0},
  totalMarks:{type:Number,min:1},
  percentage:{type:Number,min:0,max:100},
  boardRollNo:{type:String,trim:true}
},{_id:false});

resultSchema.pre('validate',function(next){
  if(
    this.obtainedMarks!==undefined &&
    this.obtainedMarks!==null &&
    this.totalMarks
  ){
    this.percentage=Number(
      ((Number(this.obtainedMarks)/Number(this.totalMarks))*100).toFixed(2)
    );
  }else{
    this.percentage=undefined;
  }
  next();
});

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  inquiryNo:{type:String,required:true},
  studentName:{type:String,required:true,trim:true},
  fatherName:{type:String,trim:true},
  previousSchool:{type:String,trim:true},

  // v3.13 structured result history.
  previousResults:{type:[resultSchema],default:[]},

  // Legacy result fields retained for old reports/migrations.
  previousExamAppeared:{type:String,trim:true},
  obtainedMarks:{type:Number,min:0},
  totalMarks:{type:Number,min:1},
  percentage:{type:Number,min:0,max:100},

  address:{type:String,trim:true},
  contactNo:{type:String,required:true,trim:true},
  normalizedContactNo:{type:String,required:true,index:true},
  programId:{type:mongoose.Schema.Types.ObjectId,ref:'Program',required:true,index:true},
  // Academic intake session selected for this inquiry. This lets the session
  // carry forward into the Admission Form instead of being re-entered.
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',index:true},

  referenceType:{
    type:String,
    enum:[
      'student',
      'staff',
      'social_media',
      'advertisement',
      'walk_in',
      'other'
    ],
    required:true,
    index:true
  },
  referenceDetail:{type:String,trim:true},

  status:{
    type:String,
    enum:['pending','followed_up','not_interested','form_submitted'],
    default:'pending',
    index:true
  },

  followUpDate:Date,
  followUps:[{
    attemptNo:{type:Number,required:true,min:1},
    followUpDate:{type:Date,required:true},
    remarks:{type:String,required:true,trim:true},
    createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
    createdAt:{type:Date,default:Date.now}
  }],

  notes:String,
  admissionApplicationId:{type:mongoose.Schema.Types.ObjectId,ref:'AdmissionApplication'},
  formSubmittedAt:Date,
  formSubmittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},

  // Legacy compatibility.
  admittedAt:Date,
  admittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,inquiryNo:1},{unique:true});
schema.index({collegeId:1,normalizedContactNo:1,createdAt:-1});
// Supports admissions lists/reports by lifecycle, session/program and newest first.
schema.index({collegeId:1,status:1,createdAt:-1});
schema.index({collegeId:1,academicSessionId:1,programId:1,status:1,createdAt:-1});

schema.pre('validate',function(next){
  if(['student','staff','other'].includes(this.referenceType)&&!String(this.referenceDetail||'').trim()){
    return next(new Error('Reference Detail is required for the selected Reference.'));
  }

  if(this.obtainedMarks!==undefined&&this.obtainedMarks!==null&&this.totalMarks){
    this.percentage=Number(
      ((Number(this.obtainedMarks)/Number(this.totalMarks))*100).toFixed(2)
    );
  }else{
    this.percentage=undefined;
  }

  next();
});

module.exports=mongoose.model('Inquiry',schema);
