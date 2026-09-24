const Sequence=require('../models/Sequence');
async function nextNumber(collegeId,key){const row=await Sequence.findOneAndUpdate({collegeId,key},{$inc:{value:1}},{new:true,upsert:true,setDefaultsOnInsert:true});return row.value;}
function pad(n,width=5){return String(n).padStart(width,'0');}
async function nextApplicationNo(collegeId){return `APP-${new Date().getFullYear()}-${pad(await nextNumber(collegeId,`admission-application-${new Date().getFullYear()}`))}`;}
async function nextAdmissionNo(collegeId){return `ADM-${new Date().getFullYear()}-${pad(await nextNumber(collegeId,`student-admission-${new Date().getFullYear()}`))}`;}
async function nextRegistrationNo(collegeId){return `REG-${new Date().getFullYear()}-${pad(await nextNumber(collegeId,`student-registration-${new Date().getFullYear()}`))}`;}
module.exports={nextNumber,nextApplicationNo,nextAdmissionNo,nextRegistrationNo};