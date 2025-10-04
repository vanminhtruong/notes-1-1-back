import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/error.js';

const FRONT_ORIGIN = process.env.FRONT_ORIGIN || 'http://localhost:5173';
const isDev = process.env.NODE_ENV !== 'production';

const app = express();

// Allow loading resources like images from other origins (e.g., frontend dev server on a different port)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS: allow LAN access in development; allowlist in production via FRONT_ORIGIN (comma-separated)
const corsOptions = isDev
  ? {
      origin: (origin, callback) => callback(null, true),
      credentials: true,
    }
  : {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowlist = String(FRONT_ORIGIN)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (allowlist.length === 0 || allowlist.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    };

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.static('public'));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
