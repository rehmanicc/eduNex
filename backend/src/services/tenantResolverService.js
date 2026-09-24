const College=require('../models/College');
const DomainVerification=require('../models/DomainVerification');

function normalizeHost(host){
  if(!host)return '';
  return String(host).split(':')[0].trim().toLowerCase();
}

async function resolveCollegeByHost(host){
  const normalized=normalizeHost(host);
  if(!normalized)return null;

  let college=await College.findOne({
    isActive:true,
    $or:[
      {customDomain:normalized},
      {subdomain:normalized}
    ]
  }).lean();

  if(college)return college;

  const verified=await DomainVerification.findOne({
    domain:normalized,
    status:'verified'
  }).lean();

  if(!verified)return null;

  return College.findOne({_id:verified.collegeId,isActive:true}).lean();
}

module.exports={normalizeHost,resolveCollegeByHost};
