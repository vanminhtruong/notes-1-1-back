const chokidar = require('chokidar');
const path = require('path');
const { sequelize } = require('../src/db');

class AutoModelSync {
  constructor() {
    this.isRunning = false;
    this.debounceTimer = null;
    this.modelsPath = path.join(__dirname, '../src/models');
  }

  async syncModels() {
    if (this.isRunning) {
      console.log('⏳ Model sync already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Model files changed, auto-syncing database...');

    try {
      // Clear require cache for all model files
      this.clearModelCache();
      
      // Re-import all models to get latest definitions
      delete require.cache[require.resolve('../src/models')];
      require('../src/models');
      
      // Run sequelize sync with alter to update schema automatically
      await sequelize.sync({ alter: true });
      
      console.log('✅ Database schema auto-synced successfully!');
    } catch (error) {
      console.error('❌ Auto-sync failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  clearModelCache() {
    // Clear cache for all model files
    const modelFiles = [
      '../src/models/index.js',
      '../src/models/user.model.js',
      '../src/models/message.model.js',
      '../src/models/group.model.js',
      '../src/models/friendship.model.js',
      '../src/models/note.model.js',
      '../src/models/sample.model.js',
      '../src/models/passwordReset.model.js',
      '../src/models/groupMember.model.js',
      '../src/models/groupMessage.model.js',
      '../src/models/groupInvite.model.js',
      '../src/models/messageRead.model.js',
      '../src/models/groupMessageRead.model.js',
      '../src/models/chatPreference.model.js'
    ];

    modelFiles.forEach(file => {
      try {
        delete require.cache[require.resolve(file)];
      } catch (error) {
        // File might not exist, that's ok
      }
    });
  }

  startWatching() {
    console.log(`👀 Watching model files in: ${this.modelsPath}`);
    
    const watcher = chokidar.watch(`${this.modelsPath}/**/*.js`, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    watcher.on('change', (filePath) => {
      console.log(`📝 Model file changed: ${path.basename(filePath)}`);
      
      // Debounce để tránh chạy nhiều lần khi save nhiều file
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(() => {
        this.syncModels();
      }, 1000);
    });

    watcher.on('add', (filePath) => {
      console.log(`➕ New model file added: ${path.basename(filePath)}`);
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.syncModels();
      }, 1000);
    });

    watcher.on('unlink', (filePath) => {
      console.log(`➖ Model file removed: ${path.basename(filePath)}`);
      this.clearModelCache();
    });

    watcher.on('error', error => {
      console.error('❌ Model watcher error:', error);
    });

    return watcher;
  }
}

// Chạy watcher nếu file được gọi trực tiếp
if (require.main === module) {
  const autoSync = new AutoModelSync();
  autoSync.startWatching();
  
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping auto model sync...');
    process.exit(0);
  });
}

module.exports = AutoModelSync;
