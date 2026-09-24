const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  vehicleCode:{type:String,trim:true,uppercase:true},
  registrationNo:{type:String,required:true,trim:true,uppercase:true},
  vehicleType:{type:String,enum:['bus','coaster','van','car','other'],default:'bus'},
  make:String,model:String,year:Number,
  seatingCapacity:{type:Number,min:1,default:1},
  driverEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',index:true},
  conductorEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',index:true},
  insuranceExpiry:Date,
  fitnessExpiry:Date,
  permitExpiry:Date,
  lastServiceAt:Date,
  nextServiceDueAt:Date,
  odometer:{type:Number,min:0,default:0},
  status:{type:String,enum:['active','maintenance','inactive'],default:'active',index:true},
  notes:String
},{timestamps:true});
schema.index({collegeId:1,vehicleCode:1},{unique:true,sparse:true});
schema.index({collegeId:1,registrationNo:1},{unique:true});
module.exports=mongoose.model('TransportVehicle',schema);
