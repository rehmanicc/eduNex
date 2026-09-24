const mongoose=require('mongoose');

const slotSchema=new mongoose.Schema({
  label:{type:String,trim:true,required:true},
  periodNo:{type:Number,min:1},
  startTime:{type:String,required:true},
  endTime:{type:String,required:true},
  isBreak:{type:Boolean,default:false}
},{_id:false});

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  scopeType:{type:String,enum:['college','branch','wing','program','section'],required:true,index:true},
  scopeId:{type:mongoose.Schema.Types.ObjectId,default:null,index:true},
  workingDays:{type:[String],default:['monday','tuesday','wednesday','thursday','friday','saturday']},
  scheduleSlots:{type:[slotSchema],default:[]},
  periodsPerDay:{type:Number,min:0,default:0},
  dayStartTime:{type:String,default:'08:00'},
  dayEndTime:{type:String,default:'14:00'},
  isActive:{type:Boolean,default:true,index:true},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});

schema.index({collegeId:1,scopeType:1,scopeId:1},{unique:true,partialFilterExpression:{isActive:true}});
module.exports=mongoose.model('TimetableScheduleProfile',schema);
