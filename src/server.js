require('dotenv').config();
if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim() === '') {
  // eslint-disable-next-line no-console
  console.error('Missing JWT_SECRET in environment. Please set it in Back/.env or environment variables.');
  process.exit(1);
}
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { sequelize } = require('./db');
const { authenticateSocket, handleConnection, emitToUser } = require('./socket/socketHandler');
const { Note, User } = require('./models');
const { Op } = require('sequelize');
const ModelManager = require('../scripts/modelManager');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    // In development, allow all origins to avoid LAN/IP CORS mismatches
    // Consider tightening this for production using an explicit allowlist
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io globally available
global.io = io;

// Also attach io to the Express app so controllers can access via req.app.get('io')
app.set('io', io);

// Socket.IO middleware and handlers
io.use(authenticateSocket);
io.on('connection', handleConnection);

// Reminder scheduler: check periodically for due reminders and emit events
const startReminderScheduler = () => {
  const intervalMs = parseInt(process.env.REMINDER_INTERVAL_MS || '30000', 10);
  const checkDueReminders = async () => {
    try {
      const now = new Date();
      // Find due reminders for active notes that haven't been sent
      const dueNotes = await Note.findAll({
        where: {
          reminderAt: { [Op.ne]: null, [Op.lte]: now },
          reminderSent: false,
          isArchived: false,
        },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        limit: 100,
      });

      for (const note of dueNotes) {
        try {
          // Optimistically mark as sent to avoid duplicate emits
          const updated = await Note.update(
            { reminderSent: true },
            { where: { id: note.id, reminderSent: false } }
          );
          // updated is [affectedCount]; only emit if we actually updated
          if (Array.isArray(updated) ? updated[0] > 0 : updated > 0) {
            emitToUser(note.userId, 'note_reminder', {
              id: note.id,
              title: note.title,
              content: note.content,
              imageUrl: note.imageUrl,
              category: note.category,
              priority: note.priority,
              isArchived: note.isArchived,
              userId: note.userId,
              reminderAt: note.reminderAt,
              reminderSent: true,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
              user: note.user ? { id: note.user.id, name: note.user.name, email: note.user.email } : undefined,
            });
          }
        } catch (e) {
          console.error('Error emitting reminder for note', note.id, e);
        }
      }
    } catch (err) {
      console.error('Reminder scheduler error:', err);
    }
  };

  // Run immediately and then on interval
  checkDueReminders();
  return setInterval(checkDueReminders, intervalMs);
};

(async () => {
  try {
    // Run automatic model migrations
    const modelManager = new ModelManager();
    await modelManager.runMigrations();

    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running at http://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`WebSocket server ready for connections`);
      // Start reminder scheduler after server is up
      startReminderScheduler();
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('Shutting down server...');
  server.close(() => process.exit(0));
});
