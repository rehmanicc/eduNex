const { collegeIdFromRequest: cid } = require('../../utils/request');
const AuditLog=require('../../models/AuditLog');
async function list(req,res){
  const q={collegeId:cid(req)};
  if(req.query.action)q.action=req.query.action;
  if(req.query.entityType)q.entityType=req.query.entityType;
  if(req.query.userId)q.userId=req.query.userId;
  if(req.query.from||req.query.to){
    q.createdAt={};
    if(req.query.from)q.createdAt.$gte=new Date(req.query.from);
    if(req.query.to)q.createdAt.$lte=new Date(req.query.to);
  }
  const limit=Math.min(200,Math.max(1,Number(req.query.limit||50)));
  const page=Math.max(1,Number(req.query.page||1));
  const [rows,total]=await Promise.all([
    AuditLog.find(q).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),
    AuditLog.countDocuments(q)
  ]);
  res.json({page,limit,total,rows});
}
module.exports={list};
