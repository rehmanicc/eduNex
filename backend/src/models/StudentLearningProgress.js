const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
 puzzles:{type:Map,of:new mongoose.Schema({foundWords:[String],hintUsed:{type:Boolean,default:false},hintWord:String,hintIndex:Number,completedAt:Date},{_id:false}),default:{}},
 totalXP:{type:Number,default:0},currentStreak:{type:Number,default:0},longestStreak:{type:Number,default:0},lastActiveDate:String
},{timestamps:true});
schema.index({collegeId:1,studentId:1},{unique:true});
module.exports=mongoose.model('StudentLearningProgress',schema);
