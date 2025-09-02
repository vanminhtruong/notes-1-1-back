const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error');

const FRONT_ORIGIN = process.env.FRONT_ORIGIN || 'http://localhost:5173';

const app = express();

// Allow loading resources like images from other origins (e.g., frontend dev server on a different port)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: FRONT_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.static('public'));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
