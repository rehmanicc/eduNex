const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  designation:{type:String,required:true,trim:true},
  departmentId:{type:mongoose.Schema.Types.ObjectId,ref:'Department',index:true},
  employmentType:{type:String,enum:['permanent','contract','visiting','part_time','intern'],default:'permanent'},
  joiningDate:{type:Date,required:true},
  endDate:Date,
  probationEndDate:Date,
  basicSalary:{type:Number,min:0,default:0},
  payFrequency:{type:String,enum:['monthly','daily','hourly'],default:'monthly'},
  status:{type:String,enum:['active','ended','suspended'],default:'active',index:true},
  notes:String
},{timestamps:true});
schema.index({collegeId:1,employeeId:1,status:1});
module.exports=mongoose.model('EmployeeContract',schema);
