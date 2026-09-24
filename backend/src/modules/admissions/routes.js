const path=require('path');
const fs=require('fs');
const multer=require('multer');
const r=require('express').Router();
const c=require('./controller');
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');

const asyncHandler=fn=>(req,res,next)=>
  Promise.resolve(fn(req,res,next)).catch(next);

const uploadDir=path.join(process.cwd(),'uploads','students');
fs.mkdirSync(uploadDir,{recursive:true});

const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadDir),
  filename:(req,file,cb)=>{
    const ext=path.extname(file.originalname||'').toLowerCase()||'.jpg';
    cb(null,`${req.params.id}-${Date.now()}${ext}`);
  }
});

const upload=multer({
  storage,
  limits:{fileSize:2*1024*1024},
  fileFilter:(req,file,cb)=>{
    const allowed=new Set(['image/jpeg','image/png','image/webp']);
    if(!allowed.has(file.mimetype)){
      return cb(new Error('Student picture must be JPG, PNG or WEBP.'));
    }
    cb(null,true);
  }
});

r.get('/reports',permit(P.VIEW_ADMISSIONS),asyncHandler(c.admissionReport));
r.get('/inquiries',permit(P.VIEW_ADMISSIONS),asyncHandler(c.listInquiries));
r.post('/inquiries',permit(P.MANAGE_ADMISSIONS),asyncHandler(c.createInquiry));
r.post('/inquiries/:id/status',permit(P.MANAGE_ADMISSIONS),asyncHandler(c.updateInquiryStatus));
r.post('/inquiries/:id/submit-form',permit(P.MANAGE_ADMISSIONS),asyncHandler(c.submitInquiryForm));
r.post('/inquiries/:id/admit',permit(P.MANAGE_ADMISSIONS),asyncHandler(c.admitInquiry));

r.get('/',permit(P.VIEW_ADMISSIONS),asyncHandler(c.listAdmissions));
r.put('/:id/profile',permit(P.MANAGE_ADMISSIONS),asyncHandler(c.completeProfile));
r.post(
  '/:id/photo',
  permit(P.MANAGE_ADMISSIONS),
  upload.single('photo'),
  asyncHandler(c.uploadPhoto)
);
r.put('/:id/migration',permit(P.MANAGE_ADMISSIONS),asyncHandler(c.updateMigration));
r.post('/:id/confirm',permit(P.APPROVE_ADMISSIONS),asyncHandler(c.confirmAdmission));

module.exports=r;
