// Deprecated compatibility model.
// Timetable divisions are scheduling-only groups; CollegeCMS no longer assigns students to them.
// Kept only so cumulative overlay patches do not require deleting an existing file.
const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 divisionId:{type:mongoose.Schema.Types.ObjectId,ref:'TimetableDivision',required:true,index:true},
 studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true}
},{timestamps:true});
schema.index({collegeId:1,divisionId:1,studentId:1},{unique:true});
module.exports=mongoose.models.TimetableDivisionMember||mongoose.model('TimetableDivisionMember',schema);
