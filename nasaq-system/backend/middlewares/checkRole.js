// Usage: router.use(checkRole('supervisor'))
module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have access to this page' });
  }
  next();
};
