const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  code:{type:String,required:true,trim:true,uppercase:true,unique:true},
  description:String,
  monthlyPrice:{type:Number,min:0,default:0},
  annualPrice:{type:Number,min:0,default:0},
  currency:{type:String,default:'PKR'},
  maxStudents:{type:Number,min:0,default:0},
  maxEmployees:{type:Number,min:0,default:0},
  maxUsers:{type:Number,min:0,default:0},
  enabledModules:{type:[String],default:[]},
  allowCustomDomain:{type:Boolean,default:false},
  allowBiometric:{type:Boolean,default:false},
  isActive:{type:Boolean,default:true,index:true}
},{timestamps:true});

module.exports=mongoose.model('SubscriptionPlan',schema);
