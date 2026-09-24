const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 sectionId:{type:mongoose.Schema.Types.ObjectId,ref:'Section',required:true,index:true},
 type:{type:String,enum:['unavailable','preferred','max_daily','max_consecutive','relative_unavailable'],required:true,index:true},
 relativePosition:{type:String,enum:['first','last'],default:null},
 relativeCount:{type:Number,min:1,max:12,default:null},
 sourceScopeType:{type:String,enum:['single','multiple','program','wing','all'],default:'single'},
 sourceScopeId:{type:mongoose.Schema.Types.ObjectId,default:null},
 batchId:{type:String,trim:true,default:''},
 dayOfWeek:{type:Number,min:0,max:6,default:null},
 startMinutes:{type:Number,min:0,max:1439,default:null},
 endMinutes:{type:Number,min:1,max:1440,default:null},
 maxPeriodsPerDay:{type:Number,min:1,max:20,default:null},
 maxConsecutivePeriods:{type:Number,min:1,max:12,default:null},
 note:{type:String,trim:true},
 isActive:{type:Boolean,default:true,index:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
module.exports=mongoose.model('ClassTimetableConstraint',schema);
