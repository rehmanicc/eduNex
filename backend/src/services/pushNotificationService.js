const User=require('../models/User');

const EXPO_PUSH_URL='https://exp.host/--/api/v2/push/send';
const isExpoToken=t=>/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(String(t||''));

async function usersForQuery(collegeId,query={}){
  return User.find({collegeId,isActive:true,...query}).select('_id pushTokens').lean();
}
function tokenList(users){
  return [...new Set((users||[]).flatMap(u=>(u.pushTokens||[]).filter(x=>x&&x.enabled!==false&&isExpoToken(x.token)).map(x=>x.token)))];
}
async function sendTokens(tokens,{title,body,data={},channelId='edunex'}){
  const clean=[...new Set((tokens||[]).filter(isExpoToken))];
  if(!clean.length)return {sent:0};
  let sent=0;
  for(let i=0;i<clean.length;i+=100){
    const chunk=clean.slice(i,i+100).map(to=>({to,title,body,data,sound:'default',channelId,priority:'high'}));
    try{
      const r=await fetch(EXPO_PUSH_URL,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(chunk)});
      if(r.ok)sent+=chunk.length;
      else console.error('expo_push_failed',r.status,await r.text());
    }catch(err){console.error('expo_push_error',err.message)}
  }
  return {sent};
}
async function sendToUsers(collegeId,userQuery,message){
  const users=await usersForQuery(collegeId,userQuery);
  return sendTokens(tokenList(users),message);
}
async function sendToStudentIds(collegeId,studentIds,message){
  const ids=(studentIds||[]).filter(Boolean);
  if(!ids.length)return {sent:0};
  return sendToUsers(collegeId,{linkedStudentId:{$in:ids}},message);
}
async function sendToEmployeeIds(collegeId,employeeIds,message){
  const ids=(employeeIds||[]).filter(Boolean);
  if(!ids.length)return {sent:0};
  return sendToUsers(collegeId,{linkedEmployeeId:{$in:ids}},message);
}
module.exports={sendTokens,sendToUsers,sendToStudentIds,sendToEmployeeIds};
