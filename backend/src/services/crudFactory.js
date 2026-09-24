const { audit } = require('./auditService');
function crud(Model, { populate = [], defaultSort = { createdAt: -1 }, beforeCreate, beforeUpdate } = {}) {
  return {
    list: async (req,res) => { const docs=await Model.find(req.tenantFilter()).populate(populate).sort(defaultSort).limit(Math.min(Number(req.query.limit)||200,500)); res.json(docs); },
    get: async (req,res) => { const doc=await Model.findOne(req.tenantFilter({_id:req.params.id})).populate(populate); if(!doc)return res.status(404).json({error:'Not found'}); res.json(doc); },
    create: async (req,res) => { let payload={...req.body}; if(!req.isPlatformOwner)payload.collegeId=req.user.collegeId; if(req.isPlatformOwner && !payload.collegeId && req.collegeId)payload.collegeId=req.collegeId; if(beforeCreate) payload=await beforeCreate(req,payload); const doc=await Model.create(payload); await audit(req,'CREATE',Model.modelName,doc._id); res.status(201).json(doc); },
    update: async (req,res) => { let payload={...req.body}; delete payload.collegeId; if(beforeUpdate)payload=await beforeUpdate(req,payload); const doc=await Model.findOneAndUpdate(req.tenantFilter({_id:req.params.id}),payload,{new:true,runValidators:true}); if(!doc)return res.status(404).json({error:'Not found'}); await audit(req,'UPDATE',Model.modelName,doc._id,{fields:Object.keys(payload)}); res.json(doc); },
    remove: async (req,res) => { const doc=await Model.findOneAndDelete(req.tenantFilter({_id:req.params.id})); if(!doc)return res.status(404).json({error:'Not found'}); await audit(req,'DELETE',Model.modelName,doc._id); res.json({message:'Deleted'}); }
  };
}
module.exports=crud;
