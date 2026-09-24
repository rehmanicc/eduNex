const mongoose=require('mongoose');
const bedSchema=new mongoose.Schema({
  bedNo:{type:String,required:true,trim:true},
  status:{type:String,enum:['available','occupied','reserved','maintenance','blocked'],default:'available'}
},{_id:true});

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  hostelId:{type:mongoose.Schema.Types.ObjectId,ref:'Hostel',required:true,index:true},
  roomNo:{type:String,required:true,trim:true},
  roomType:{type:String,enum:['single','double','triple','quad','dormitory','custom'],default:'double'},
  capacity:{type:Number,min:1,required:true},
  monthlyFee:{type:Number,min:0,default:0},
  securityDeposit:{type:Number,min:0,default:0},
  beds:{type:[bedSchema],default:[]},
  status:{type:String,enum:['active','maintenance','closed'],default:'active',index:true},
  notes:String
},{timestamps:true});
schema.index({collegeId:1,hostelId:1,roomNo:1},{unique:true});
module.exports=mongoose.model('HostelRoom',schema);
