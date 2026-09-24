module.exports = function passwordChangeRequired(req, res, next) {
  if (req.user?.systemRole === 'platform_owner') return next();
  if (!req.user?.mustChangePassword) return next();
  return res.status(403).json({
    error: 'Password change required before accessing the application',
    code: 'PASSWORD_CHANGE_REQUIRED'
  });
};
