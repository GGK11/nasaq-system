const router = require('express').Router();
const authenticate = require('../middlewares/authenticate');
const checkRole = require('../middlewares/checkRole');
const upload = require('../middlewares/upload');
const c = require('../controllers/doctorController');

router.use(authenticate, checkRole('doctor'));

router.get('/profile', c.profile);
router.get('/schedule', c.schedule);                         // ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/available-shifts', c.availableShifts);          // colleagues' shifts offered for swap
router.post('/shifts/:id/offer', c.offerShift);              // { offered: true|false }
router.post('/shifts/:id/take', upload.none(), c.takeShift); // ask to cover an offered shift
router.post('/excuse', upload.single('attachment'), c.submitExcuse); // swap or leave request
router.get('/requests', c.myRequests);
router.delete('/requests/:id', c.cancelRequest);

module.exports = router;
