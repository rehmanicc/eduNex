const mongoose=require('mongoose');
const answerSchema=new mongoose.Schema({questionId:{type:mongoose.Schema.Types.ObjectId,required:true},value:{type:mongoose.Schema.Types.Mixed,default:null}},{_id:false});
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  surveyId:{type:mongoose.Schema.Types.ObjectId,ref:'FeedbackSurvey',required:true,index:true},
  respondentUserId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  respondentType:{type:String,enum:['student','teacher'],required:true},
  answers:{type:[answerSchema],default:[]},
  submittedAt:{type:Date,default:Date.now}
},{timestamps:true});
schema.index({collegeId:1,surveyId:1,respondentUserId:1},{unique:true});
module.exports=mongoose.model('FeedbackResponse',schema);
