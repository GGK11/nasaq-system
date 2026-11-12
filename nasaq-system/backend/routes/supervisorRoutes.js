const router = require('express').Router();
const authenticate = require('../middlewares/authenticate');
const checkRole = require('../middlewares/checkRole');
const c = require('../controllers/supervisorController');

router.use(authenticate, checkRole('supervisor'));

router.get('/profile', c.profile);
router.get('/team', c.team);
router.get('/team/:id', c.doctorDetail);
router.get('/shifts', c.shifts);                          // ?from&to
router.get('/open-shifts', c.openShifts);
router.get('/replacements', c.replacements);              // ?shift_id=  → ranked candidates
router.post('/shifts/:id/assign', c.assignShift);         // { doctor_id }
router.put('/shifts/:id/attendance', c.setAttendance);    // { attendance }
router.get('/pending-excuses', (req, res, next) => { req.query.status = 'pending'; next(); }, c.requests);
router.get('/requests', c.requests);                      // ?status=pending|approved|rejected|all
router.post('/requests/:id/decide', c.decide);            // { decision, note, replacement_id }
router.get('/availability', c.availability);              // ?date
router.get('/summary', c.summary);                        // ?month=YYYY-MM
router.get('/reports', c.reports);
router.post('/reports', c.createReport);

module.exports = router;
