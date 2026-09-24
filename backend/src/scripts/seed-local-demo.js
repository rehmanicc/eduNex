require('dotenv').config();
const bcrypt=require('bcryptjs');
const connectDB=require('../config/db');
const College=require('../models/College');
const User=require('../models/User');
const Role=require('../models/Role');
const {seedDefaultRoles}=require('../services/roleService');

(async()=>{
  await connectDB();
  let college=await College.findOne({slug:'demo-college'});
  if(!college){
    college=await College.create({
      name:'Demo College',slug:'demo-college',subdomain:'demo-college',
      branding:{primaryColor:'#1f4f8f',secondaryColor:'#e8eef7'},
      isActive:true,subscriptionStatus:'trial'
    });
    await seedDefaultRoles(college._id);
  }
  let role=await Role.findOne({collegeId:college._id,code:'director'});
  if(!role) role=await Role.findOne({collegeId:college._id});
  const email=process.env.DEMO_ADMIN_EMAIL||'director@demo.local';
  const password=process.env.DEMO_ADMIN_PASSWORD||'Demo@12345';
  let user=await User.findOne({email});
  if(!user){
    const hash=await bcrypt.hash(password,12);
    const payload={
  collegeId:college._id,
  name:'Demo Director',
  email,
  passwordHash:hash,
  isActive:true
};
    if(role) payload.roleIds=[role._id];
    user=await User.create(payload);
  }
  console.log(JSON.stringify({
    message:'Local demo ready',
    collegeId:String(college._id),
    email,
    password,
    note:'Use these credentials only for local development.'
  },null,2));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
