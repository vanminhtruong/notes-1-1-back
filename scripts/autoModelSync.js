import chokidar from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../src/db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      // Note: In ES6 modules, we cannot clear import cache dynamically
      // This is a limitation of ES6 modules. Consider restarting the process
      // or using a different approach for hot reloading in development
      
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
    // Note: ES6 modules don't support clearing import cache
    // This method is kept for compatibility but won't work with ES6
    console.log('⚠️  Warning: Cannot clear import cache with ES6 modules');
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
if (import.meta.url === `file://${process.argv[1]}`) {
  const autoSync = new AutoModelSync();
  autoSync.startWatching();
  
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping auto model sync...');
    process.exit(0);
  });
}

export default AutoModelSync;
