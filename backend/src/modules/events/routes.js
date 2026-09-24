const r=require('express').Router();
const multer=require('multer');
const path=require('path');
const fs=require('fs');
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

const uploadDir=path.join(process.cwd(),'uploads','events');
fs.mkdirSync(uploadDir,{recursive:true});
const storage=multer.diskStorage({destination:(_req,_file,cb)=>cb(null,uploadDir),filename:(_req,file,cb)=>{const ext=path.extname(file.originalname||'').toLowerCase();cb(null,`event-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`)}});
const upload=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(_req,file,cb)=>{const allowed=['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];if(!allowed.includes(file.mimetype))return cb(Object.assign(new Error('Only PDF, image, DOC and DOCX attachments are allowed'),{status:400}));cb(null,true)}});

r.get('/meta',permit(P.VIEW_EVENTS),c.meta);
r.get('/dashboard',permit(P.VIEW_EVENTS),c.dashboard);
r.get('/settings',permit(P.VIEW_EVENTS),c.settings);
r.put('/settings',permit(P.MANAGE_EVENTS),c.saveSettings);
r.get('/registrations/list',permit(P.VIEW_EVENTS),c.listRegistrations);
r.post('/registrations/:registrationId/attendance',permit(P.MANAGE_EVENT_REGISTRATIONS),c.markAttendance);
r.get('/',permit(P.VIEW_EVENTS),c.listEvents);
r.post('/',permit(P.MANAGE_EVENTS),c.createEvent);
r.put('/:id',permit(P.MANAGE_EVENTS),c.updateEvent);
r.post('/:id/publish',permit(P.MANAGE_EVENTS),c.publishEvent);
r.post('/:id/cancel',permit(P.MANAGE_EVENTS),c.cancelEvent);
r.post('/:id/attachment',permit(P.MANAGE_EVENTS),upload.single('attachment'),c.uploadAttachment);
r.post('/:id/register',permit(P.VIEW_EVENTS),c.register);

module.exports=r;
