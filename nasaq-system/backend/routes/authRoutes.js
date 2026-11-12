const router = require('express').Router();
const authenticate = require('../middlewares/authenticate');
const auth = require('../controllers/authController');
const common = require('../controllers/commonController');

router.post('/login', auth.login);           // POST /api/login (alias mounted in server.js too)
router.get('/me', authenticate, auth.me);

// shared endpoints for both roles
router.get('/notifications', authenticate, common.notifications);
router.post('/notifications/read-all', authenticate, common.markAllRead);
router.post('/notifications/:id/read', authenticate, common.markRead);
router.put('/settings', authenticate, common.updateSettings);
router.put('/password', authenticate, common.changePassword);
router.get('/attachments/:requestId', authenticate, common.attachment);
router.get('/export/schedule', authenticate, common.exportSchedule);

module.exports = router;
