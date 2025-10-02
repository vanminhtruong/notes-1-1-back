import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import v1 from './v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', name: pkg.name, version: pkg.version, time: new Date().toISOString() });
});

router.use('/v1', v1);

export default router;
