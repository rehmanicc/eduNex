const r = require('express').Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const controller = require('./controller');
const permit = require('../../middleware/permissions');
const allowRole = require('../../middleware/roles');
const P = require('../../constants/permissions');

const uploadDir = path.join(process.cwd(), 'uploads', 'employees');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `employee-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(
        Object.assign(
          new Error('Only JPG, PNG and WEBP images are allowed'),
          { status: 400 }
        )
      );
    }
    cb(null, true);
  }
});

function validEmployeeId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid employee id' });
  }
  next();
}

// Named/static routes first.
r.get(
  '/options',
  permit(P.VIEW_EMPLOYEES),
  controller.options
);

r.get(
  '/',
  permit(P.VIEW_EMPLOYEES),
  controller.list
);

r.post(
  '/',
  permit(P.MANAGE_EMPLOYEES),
  controller.create
);

r.post(
  '/:id/photo',
  permit(P.MANAGE_EMPLOYEES),
  validEmployeeId,
  upload.single('photo'),
  controller.uploadPhoto
);

r.post(
  '/:id/login',
  permit(P.MANAGE_EMPLOYEES),
  allowRole('director', 'principal'),
  validEmployeeId,
  controller.createLogin
);

r.get(
  '/:id',
  permit(P.VIEW_EMPLOYEES),
  validEmployeeId,
  controller.get
);

r.put(
  '/:id',
  permit(P.MANAGE_EMPLOYEES),
  validEmployeeId,
  controller.update
);

r.delete(
  '/:id',
  permit(P.MANAGE_EMPLOYEES),
  validEmployeeId,
  controller.remove
);

module.exports = r;
