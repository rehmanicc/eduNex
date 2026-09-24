const { authLimiter } = require('../../config/security');
const router = require('express').Router();
const c = require('./controller');
const auth = require('../../middleware/auth');
const tenant = require('../../middleware/tenant');

router.post('/login', authLimiter, c.login);
router.post('/change-password', auth, c.changePassword);
router.get('/me', auth, tenant, c.me);

module.exports = router;
