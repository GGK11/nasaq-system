require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev-only-secret-change-me';
  console.warn('⚠  JWT_SECRET not set in .env — using an insecure development secret.');
}

const seed = require('./config/seed');
if (seed()) console.log('✓ Demo data created (password for all users: nasaq123)');

const app = express();
app.use(express.json());

// API
const auth = require('./controllers/authController');
app.post('/api/login', auth.login);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/doctor', require('./routes/doctorRoutes'));
app.use('/api/supervisor', require('./routes/supervisorRoutes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Frontend
const FRONT = path.join(__dirname, '..', 'frontend');
app.use('/js', express.static(path.join(FRONT, 'js')));
app.use(express.static(path.join(FRONT, 'public')));

// Errors (multer, bad JSON, etc.)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 400).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NASAQ running → http://localhost:${PORT}`));
