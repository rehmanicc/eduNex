const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  roomId:{type:mongoose.Schema.Types.ObjectId,ref:'HostelRoom',index:true},
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',index:true},
  category:{type:String,enum:['electricity','plumbing','furniture','cleanliness','security','mess','other'],default:'other'},
  title:{type:String,required:true,trim:true},
  description:String,
  priority:{type:String,enum:['low','medium','high','urgent'],default:'medium',index:true},
  status:{type:String,enum:['open','in_progress','resolved','closed'],default:'open',index:true},
  assignedToEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee'},
  resolvedAt:Date,
  resolutionNotes:String,
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
module.exports=mongoose.model('HostelComplaint',schema);
