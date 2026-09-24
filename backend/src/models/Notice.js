const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  noticeNo:{type:String,required:true,trim:true},
  title:{type:String,required:true,trim:true},
  body:{type:String,required:true,trim:true},
  categoryId:{type:mongoose.Schema.Types.ObjectId,ref:'NoticeCategory',default:null,index:true},
  audience:{type:String,enum:['all','students','employees','program','section','employee_category'],default:'all',index:true},
  branchId:{type:mongoose.Schema.Types.ObjectId,ref:'Branch',default:null,index:true},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',default:null,index:true},
  targetProgramIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Program'}],
  targetSectionIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Section'}],
  employeeCategory:{type:String,enum:['academic_staff','non_teaching_staff'],default:undefined},
  priority:{type:String,enum:['normal','important','urgent'],default:'normal'},
  publishAt:{type:Date,default:Date.now,index:true},
  expireAt:{type:Date,default:null,index:true},
  status:{type:String,enum:['draft','scheduled','published','expired','cancelled'],default:'draft',index:true},
  attachmentUrl:{type:String,default:''},
  attachmentName:{type:String,default:''},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  publishedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  publishedAt:{type:Date,default:null},
  cancelledBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  cancelledAt:{type:Date,default:null}
},{timestamps:true});
schema.index({collegeId:1,noticeNo:1},{unique:true});
module.exports=mongoose.model('Notice',schema);
