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
  inquiryId:{type:mongoose.Schema.Types.ObjectId,ref:'Inquiry',required:true,index:true},
  formNo:{type:String,index:true},

  // Prefetched from Inquiry; Admission Office may correct these fields.
  studentName:{type:String,required:true,trim:true},
  fatherName:{type:String,trim:true},
  address:String,
  contactNo:String,
  fatherContact:{type:String,trim:true},
  whatsappNo:{type:String,trim:true},
  email:{type:String,trim:true,lowercase:true},
  guardianName:{type:String,trim:true},
  guardianContact:{type:String,trim:true},
  guardianRelation:{type:String,trim:true},
  previousSchool:String,
  programId:{type:mongoose.Schema.Types.ObjectId,ref:'Program',required:true,index:true},
  previousResults:{type:[resultSchema],default:[]},

  // Reference is historical Inquiry information and is never editable here.
  referenceType:{type:String,trim:true},
  referenceDetail:{type:String,trim:true},

  bFormCnic:{type:String,trim:true},
  fatherCnic:{type:String,trim:true},
  bloodGroup:{type:String,trim:true},
  secondAddress:String,
  alternateContactNo:String,
  dateOfBirth:Date,
  gender:String,

  // Optional uploaded picture.
  studentPhotoUrl:{type:String,trim:true},

  // Legacy result fields retained for older reports.
  previousExamAppeared:String,
  previousMarks:{type:Number,min:0},
  previousTotalMarks:{type:Number,min:1},
  previousPercentage:{type:Number,min:0,max:100},
  resultDate:Date,
  eligible:{type:Boolean,default:false},
  resultStatus:{
    type:String,
    enum:['awaiting_result','result_declared','verified'],
    default:'awaiting_result',
    index:true
  },

  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',index:true},
  periodNumber:{type:Number,min:1,default:1},

  migrationRequired:{type:Boolean,default:false,index:true},
  migrationCertificateNo:{type:String,trim:true},

  status:{
    type:String,
    enum:['form_submitted','fee_pending','provisional','confirmed','rejected','cancelled'],
    default:'form_submitted',
    index:true
  },

  feePackageId:{type:mongoose.Schema.Types.ObjectId,ref:'FeePackage'},
  studentFeePlanId:{type:mongoose.Schema.Types.ObjectId,ref:'StudentFeePlan'},
  rollNo:{type:String,trim:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student'},
  formSubmittedAt:{type:Date,default:Date.now},
  formSubmittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},

  // Legacy compatibility.
  admittedAt:Date,
  admittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  confirmedAt:Date,
  confirmedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index(
  {collegeId:1,formNo:1},
  {unique:true,partialFilterExpression:{formNo:{$type:'string'}}}
);
schema.index({collegeId:1,inquiryId:1},{unique:true});
schema.index(
  {collegeId:1,rollNo:1},
  {unique:true,partialFilterExpression:{rollNo:{$type:'string'}}}
);
// Supports admission lifecycle lists and session/program filters.
schema.index({collegeId:1,status:1,createdAt:-1});
schema.index({collegeId:1,academicSessionId:1,programId:1,status:1,createdAt:-1});
schema.index({collegeId:1,studentId:1});

schema.pre('validate',function(next){
  if(this.previousMarks!==undefined&&this.previousMarks!==null&&this.previousTotalMarks){
    this.previousPercentage=Number(
      ((Number(this.previousMarks)/Number(this.previousTotalMarks))*100).toFixed(2)
    );
  }else{
    this.previousPercentage=undefined;
  }
  next();
});

module.exports=mongoose.model('AdmissionApplication',schema);
