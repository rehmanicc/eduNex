const BiometricDevice = require('../../models/BiometricDevice');
const BiometricIdentity = require('../../models/BiometricIdentity');
const BiometricEvent = require('../../models/BiometricEvent');
const College = require('../../models/College');
const crud = require('../../services/crudFactory');
const service = require('./service');
const pick = (source, fields) => {
  const out = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) out[field] = source[field];
  }
  return out;
};
const DEVICE_FIELDS = ['branchId','name','serialNumber','deviceCode','vendor','model','location','ipAddress','integrationType','secret','isActive'];
const IDENTITY_FIELDS = ['deviceId','biometricUserId','personType','personId','isActive'];


exports.devices = {
  list: async (req, res) => {
    res.json(await BiometricDevice.find(req.tenantFilter()).populate('branchId','name code').sort({ name: 1 }));
  },
  create: async (req, res) => {
    const collegeId = req.collegeId || req.user.collegeId;
    const payload = {
      ...pick(req.body, DEVICE_FIELDS),
      collegeId,
      vendor: String(req.body.vendor || 'generic').toLowerCase(),
      serialNumber: String(req.body.serialNumber || req.body.deviceCode || '').trim(),
      deviceCode: String(req.body.deviceCode || req.body.serialNumber || '').trim().toUpperCase(),
      integrationType: req.body.integrationType || 'both',
      createdBy: req.user._id,
      updatedBy: req.user._id
    };
    if (!payload.name || !payload.serialNumber) return res.status(400).json({ error: 'Device Name and Device Code / Serial Number are required' });
    res.status(201).json(await BiometricDevice.create(payload));
  },
  update: async (req, res) => {
    const payload = {
      ...pick(req.body, DEVICE_FIELDS),
      vendor: String(req.body.vendor || 'generic').toLowerCase(),
      updatedBy: req.user._id
    };
    if (req.body.deviceCode) payload.deviceCode = String(req.body.deviceCode).toUpperCase();
    const doc = await BiometricDevice.findOneAndUpdate(req.tenantFilter({ _id:req.params.id }), { $set:payload }, { new:true, runValidators:true });
    if (!doc) return res.status(404).json({ error:'Biometric device not found' });
    res.json(doc);
  }
};

exports.identities = {
  list: async (req, res) => {
    const filter=req.tenantFilter({ isActive:true });
    if(req.query.deviceId)filter.deviceId=req.query.deviceId;
    res.json(await BiometricIdentity.find(filter).populate('deviceId','name serialNumber deviceCode vendor model').sort({ biometricUserId:1 }));
  },
  create: async (req, res) => {
    const collegeId=req.collegeId||req.user.collegeId;
    const payload={...pick(req.body, IDENTITY_FIELDS),collegeId,createdBy:req.user._id,updatedBy:req.user._id};
    res.status(201).json(await BiometricIdentity.create(payload));
  },
  update: async (req, res) => {
    const doc=await BiometricIdentity.findOneAndUpdate(req.tenantFilter({_id:req.params.id}),{$set:{...pick(req.body, IDENTITY_FIELDS),updatedBy:req.user._id}},{new:true,runValidators:true});
    if(!doc)return res.status(404).json({error:'Biometric identity not found'});
    res.json(doc);
  }
};

exports.ingest = async (req, res) => {
  const serial = req.params.serial;
  const secret = req.headers['x-device-secret'];
  const device = await BiometricDevice.findOne({ serialNumber: serial, isActive: true }).select('+secret');
  if (!device || !device.secret || secret !== device.secret) return res.status(401).json({ error: 'Invalid device credentials' });
  if (req.body.biometricUserId == null) return res.status(400).json({ error: 'biometricUserId is required' });
  try {
    const result = await service.ingest({ device, biometricUserId: String(req.body.biometricUserId), eventTime: req.body.eventTime || new Date(), rawPayload: req.body });
    res.status(202).json({ status: result.processingStatus, message: result.processingMessage, eventId: result._id, attendanceId: result.attendanceId, sessionId: result.sessionId, eventKind: result.eventKind });
  } catch (err) {
    if (err?.code === 11000) return res.status(202).json({ status: 'duplicate', message: 'Exact duplicate event ignored' });
    throw err;
  }
};

exports.events = async (req, res) => {
  const filter = req.tenantFilter();
  if (req.query.status) filter.processingStatus = req.query.status;
  if (req.query.deviceId) filter.deviceId = req.query.deviceId;
  if (req.query.date) {
    const start=new Date(`${req.query.date}T00:00:00`);
    const end=new Date(`${req.query.date}T23:59:59.999`);
    filter.eventTime={$gte:start,$lte:end};
  }
  const rows=await BiometricEvent.find(filter).populate('deviceId','name serialNumber deviceCode vendor model location').sort({eventTime:-1}).limit(Math.min(Number(req.query.limit||500),1000)).lean();
  const keys=[...new Set(rows.map(r=>`${r.deviceId?._id||r.deviceId}|${r.biometricUserId}`))];
  const identities=await BiometricIdentity.find({collegeId:req.collegeId||req.user.collegeId,$or:keys.map(k=>{const [deviceId,biometricUserId]=k.split('|');return{deviceId,biometricUserId};})}).lean();
  const identityMap=new Map(identities.map(i=>[`${i.deviceId}|${i.biometricUserId}`,i]));
  const employeeIds=identities.filter(i=>['staff','teacher'].includes(i.personType)).map(i=>i.personId);
  const employees=employeeIds.length?await require('../../models/Employee').find({_id:{$in:employeeIds}}).select('employeeNo employeeCode name').lean():[];
  const employeeMap=new Map(employees.map(e=>[String(e._id),e]));
  res.json(rows.map(row=>{
    const identity=identityMap.get(`${row.deviceId?._id||row.deviceId}|${row.biometricUserId}`);
    return {...row,identity,employee:identity?employeeMap.get(String(identity.personId))||null:null};
  }));
};

exports.staffMappings = async (req,res)=>{
  const cid=req.collegeId||req.user.collegeId;
  const filter={collegeId:cid,isActive:true,personType:{$in:['staff','teacher']}};
  if(req.query.deviceId)filter.deviceId=req.query.deviceId;
  res.json(await BiometricIdentity.find(filter).populate('deviceId','name deviceCode serialNumber').populate({path:'personId',model:'Employee',select:'employeeNo employeeCode name designation'}).sort({biometricUserId:1}));
};

exports.saveStaffMapping = async (req,res)=>{
  const cid=req.collegeId||req.user.collegeId;
  const Employee=require('../../models/Employee');
  const employee=await Employee.findOne({_id:req.body.employeeId,collegeId:cid,isActive:true});
  if(!employee)return res.status(400).json({error:'Select a valid active employee'});
  const device=await BiometricDevice.findOne({_id:req.body.deviceId,collegeId:cid,isActive:true});
  if(!device)return res.status(400).json({error:'Select a valid biometric device'});
  const biometricUserId=String(req.body.biometricUserId||'').trim();
  if(!biometricUserId)return res.status(400).json({error:'Biometric User ID / PIN is required'});
  const personType=employee.category==='academic_staff'?'teacher':'staff';
  const doc=await BiometricIdentity.findOneAndUpdate(
    {collegeId:cid,deviceId:device._id,personType,personId:employee._id},
    {$set:{biometricUserId,isActive:true,updatedBy:req.user._id},$setOnInsert:{collegeId:cid,deviceId:device._id,personType,personId:employee._id,createdBy:req.user._id}},
    {upsert:true,new:true,runValidators:true}
  );
  res.json(doc);
};

exports.importRows = async (req,res)=>{
  const cid=req.collegeId||req.user.collegeId;
  const device=await BiometricDevice.findOne({_id:req.body.deviceId,collegeId:cid,isActive:true});
  if(!device)return res.status(404).json({error:'Biometric device not found'});
  res.json(await service.importRows({device,rows:req.body.rows||[],userId:req.user._id}));
};

exports.health = async (req, res) => {
  const cid = req.collegeId || req.user.collegeId;
  const college = await College.findById(cid).select('attendanceSettings.deviceOfflineMinutes');
  const offlineMinutes = Number(college?.attendanceSettings?.deviceOfflineMinutes ?? 5);
  const threshold = Date.now() - offlineMinutes * 60 * 1000;
  const rows = await BiometricDevice.find(req.tenantFilter()).sort({ name: 1 }).lean();
  res.json(rows.map(d => ({
    ...d,
    healthStatus: d.isActive && d.lastSeenAt && new Date(d.lastSeenAt).getTime() >= threshold ? 'online' : 'offline',
    offlineAfterMinutes: offlineMinutes
  })));
};
