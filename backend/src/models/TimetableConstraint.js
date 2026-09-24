const mongoose=require('mongoose');

const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 teacherId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
 type:{
   type:String,
   enum:['unavailable','preferred','max_daily','max_consecutive','avoid_first','avoid_last'],
   default:'unavailable',
   index:true
 },
 dayOfWeek:{type:Number,min:0,max:6,default:null},
 startMinutes:{type:Number,min:0,max:1439,default:null},
 endMinutes:{type:Number,min:1,max:1440,default:null},
 periodNo:{type:Number,min:1,default:null}, // legacy compatibility
 available:{type:Boolean,default:false},    // legacy compatibility
 maxPeriodsPerDay:{type:Number,min:1,max:20,default:null},
 maxConsecutivePeriods:{type:Number,min:1,max:12,default:null},
 note:{type:String,trim:true},
 isActive:{type:Boolean,default:true,index:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,teacherId:1,type:1,dayOfWeek:1,startMinutes:1,endMinutes:1});
module.exports=mongoose.model('TimetableConstraint',schema);
