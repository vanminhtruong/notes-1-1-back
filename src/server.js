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
const { authenticateSocket, handleConnection } = require('./socket/socketHandler');
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
