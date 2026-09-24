const mongoose=require('mongoose');
const stopSchema=new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  pickupTime:String,
  dropTime:String,
  sequence:{type:Number,required:true,min:1},
  monthlyFee:{type:Number,min:0,default:0},
  landmark:String
},{_id:true});
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  name:{type:String,required:true,trim:true},
  code:{type:String,required:true,trim:true,uppercase:true},
  vehicleId:{type:mongoose.Schema.Types.ObjectId,ref:'TransportVehicle',index:true},
  stops:{type:[stopSchema],default:[]},
  startPoint:String,
  endPoint:String,
  defaultMonthlyFee:{type:Number,min:0,default:0},
  isActive:{type:Boolean,default:true,index:true}
},{timestamps:true});
schema.index({collegeId:1,code:1},{unique:true});
// Optimization index for common operational queries.
schema.index({collegeId:1,isActive:1,vehicleId:1});
module.exports=mongoose.model('TransportRoute',schema);
