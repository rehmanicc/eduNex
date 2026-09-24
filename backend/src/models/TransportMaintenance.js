const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  vehicleId:{type:mongoose.Schema.Types.ObjectId,ref:'TransportVehicle',required:true,index:true},
  type:{type:String,enum:['service','repair','tyre','oil','inspection','other'],required:true},
  description:String,
  serviceDate:{type:Date,required:true,index:true},
  odometer:{type:Number,min:0},
  cost:{type:Number,min:0,default:0},
  vendor:String,
  nextDueDate:Date,
  status:{type:String,enum:['scheduled','in_progress','completed'],default:'completed'},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
module.exports=mongoose.model('TransportMaintenance',schema);
