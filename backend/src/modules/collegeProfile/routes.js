const r = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const c = require('./controller');
const P = require('../../constants/permissions');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function collegeSettingsAccess(req, res, next) {
  if (req.user?.systemRole === 'platform_owner') return next();
  const permissions = new Set(req.user?.effectivePermissions || []);
  const roleCodes = new Set(req.user?.roleCodes || []);
  if (permissions.has('*') || permissions.has(P.MANAGE_COLLEGE) || roleCodes.has('director') || roleCodes.has('admin')) return next();
  return res.status(403).json({ error: 'College Profile access is restricted to Director, Admin or an explicitly authorized user' });
}

const uploadDir = path.join(process.cwd(), 'uploads', 'colleges');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safe = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png';
    cb(null, `college-${Date.now()}-${Math.round(Math.random() * 1e9)}${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => ['image/jpeg','image/png','image/webp'].includes(file.mimetype)
    ? cb(null, true)
    : cb(Object.assign(new Error('Only JPG, PNG and WEBP image files are allowed'), { status: 400 }))
});

r.use(collegeSettingsAccess);
r.get('/', asyncHandler(c.get));
r.put('/', asyncHandler(c.updateProfile));
r.post('/logo', upload.single('logo'), asyncHandler(c.uploadLogo));
r.post('/banner', upload.single('banner'), asyncHandler(c.uploadBanner));
r.get('/branches', asyncHandler(c.listBranches));
r.post('/branches', asyncHandler(c.createBranch));
r.put('/branches/:id', asyncHandler(c.updateBranch));
r.put('/timetable', asyncHandler(c.updateTimetable));

module.exports = r;
