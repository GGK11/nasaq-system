// Supporting documents attached to requests (medical report, etc.)
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const ALLOWED = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'];

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
});

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Allowed files: PDF, image, Word (max 5 MB)'), ok);
  },
});
