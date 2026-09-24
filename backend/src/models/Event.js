const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  eventNo:{type:String,trim:true,index:true},
  title:{type:String,required:true,trim:true},
  code:{type:String,trim:true},
  category:{type:String,enum:['academic','cultural','sports','seminar','workshop','orientation','social','other'],default:'other',index:true},
  description:{type:String,default:''},
  venue:{type:String,default:''},
  startAt:{type:Date,required:true,index:true},
  endAt:{type:Date,required:true,index:true},
  audienceType:{type:String,enum:['all','students','employees','program','section','employee_category'],default:'all',index:true},
  // Legacy audience array is retained for compatibility with existing event registrations/mobile work.
  audience:{type:[String],default:['student']},
  branchId:{type:mongoose.Schema.Types.ObjectId,ref:'Branch',default:null,index:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',default:null,index:true},
  targetProgramIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Program'}],
  targetSectionIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Section'}],
  employeeCategory:{type:String,enum:['academic_staff','non_teaching_staff'],default:undefined},
  organizerEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',default:null,index:true},
  priority:{type:String,enum:['normal','important','urgent'],default:'normal',index:true},
  status:{type:String,enum:['draft','scheduled','active','published','completed','cancelled'],default:'draft',index:true},
  registrationRequired:{type:Boolean,default:false},
  capacity:{type:Number,min:0,default:0},
  attachmentUrl:{type:String,default:''},
  attachmentName:{type:String,default:''},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  publishedAt:{type:Date,default:null},
  cancelledAt:{type:Date,default:null}
},{timestamps:true});
schema.index({collegeId:1,eventNo:1},{unique:true,sparse:true});
schema.index({collegeId:1,startAt:1,status:1});
module.exports=mongoose.model('Event',schema);
