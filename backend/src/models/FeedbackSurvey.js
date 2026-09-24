const mongoose=require('mongoose');
const questionSchema=new mongoose.Schema({
  prompt:{type:String,required:true,trim:true},
  type:{type:String,enum:['rating','multiple_choice','yes_no','text'],required:true},
  required:{type:Boolean,default:true},
  options:{type:[String],default:[]},
  order:{type:Number,default:0}
},{_id:true});
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  title:{type:String,required:true,trim:true},
  description:{type:String,trim:true,default:''},
  audience:{type:String,enum:['students','teachers','both'],required:true,default:'students'},
  academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',default:null},
  programIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Program'}],
  sectionIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Section'}],
  mandatory:{type:Boolean,default:false,index:true},
  anonymous:{type:Boolean,default:true},
  startsAt:{type:Date,default:Date.now},
  closesAt:{type:Date,default:null},
  status:{type:String,enum:['draft','published','closed'],default:'draft',index:true},
  questions:{type:[questionSchema],default:[]},
  publishedAt:{type:Date,default:null},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
schema.index({collegeId:1,status:1,startsAt:1,closesAt:1});
module.exports=mongoose.model('FeedbackSurvey',schema);
