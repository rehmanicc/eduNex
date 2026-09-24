const AuditLog=require('../models/AuditLog');
async function audit(req, action, entity, entityId, metadata={}) {
  try { await AuditLog.create({ collegeId:req.user?.collegeId || req.collegeId || null, userId:req.user?._id, action, entity, entityId, metadata, ip:req.ip }); } catch(e){ console.error('Audit failed', e.message); }
}
module.exports={audit};
