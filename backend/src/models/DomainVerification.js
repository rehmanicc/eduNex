const mongoose=require('mongoose');

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  domain:{type:String,required:true,trim:true,lowercase:true},
  type:{type:String,enum:['subdomain','custom'],required:true},
  verificationToken:{type:String,required:true},
  verificationMethod:{type:String,enum:['dns_txt','cname','manual'],default:'dns_txt'},
  status:{type:String,enum:['pending','verified','failed','revoked'],default:'pending',index:true},
  verifiedAt:Date,
  lastCheckedAt:Date,
  errorMessage:String
},{timestamps:true});

schema.index({domain:1},{unique:true});
module.exports=mongoose.model('DomainVerification',schema);
