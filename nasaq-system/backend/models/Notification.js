const db = require('../config/database');

const Notification = {
  create(userId, message, link = null) {
    db.prepare('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)').run(userId, message, link);
  },
  forUser(userId, limit = 50) {
    return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
  },
  unreadCount(userId) {
    return db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).c;
  },
  markRead(id, userId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  },
  markAllRead(userId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  },
};

module.exports = Notification;
