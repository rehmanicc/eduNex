const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',index:true,default:null},
  name:{type:String,required:true,trim:true},
  email:{type:String,required:true,lowercase:true,trim:true},
  emailIsSynthetic:{type:Boolean,default:false},
  cnic:{type:String,trim:true,default:''},
  cnicNormalized:{type:String,trim:true,default:''},
  // Students may authenticate with Roll No. Stored normalized for direct lookup.
  loginRollNo:{type:String,trim:true,lowercase:true,default:''},
  phone:String,
  passwordHash:{type:String,required:true},
  mustChangePassword:{type:Boolean,default:false,index:true},
  passwordChangedAt:Date,
  systemRole:{type:String,enum:['platform_owner'],default:undefined},
  roleIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Role'}],
  directPermissions:{type:[String],default:[]},

  branchAccess:{
    mode:{type:String,enum:['all','selected'],default:'selected'},
    branchIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Branch'}]
  },

  linkedStudentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student'},
  linkedEmployeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee'},
  isActive:{type:Boolean,default:true},
  lastLoginAt:Date,
  pushTokens:[{
    token:{type:String,required:true},
    platform:{type:String,enum:['android','ios'],default:'android'},
    deviceName:{type:String,trim:true,default:''},
    enabled:{type:Boolean,default:true},
    lastSeenAt:{type:Date,default:Date.now}
  }]
},{timestamps:true});

schema.index({email:1},{unique:true});
schema.index({collegeId:1,email:1});
schema.index({cnicNormalized:1},{unique:true,partialFilterExpression:{cnicNormalized:{$type:'string',$gt:''}}});
schema.index({collegeId:1,loginRollNo:1},{unique:true,partialFilterExpression:{loginRollNo:{$type:'string',$gt:''}}});
schema.index({collegeId:1,'branchAccess.branchIds':1});

module.exports=mongoose.model('User',schema);
