import swaggerUi from 'swagger-ui-express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { openApiSpec } from './openapi.js';

const isProduction = process.env.NODE_ENV === 'production';
const enabled = process.env.SWAGGER_ENABLED === undefined
  ? !isProduction
  : process.env.SWAGGER_ENABLED === 'true';

// Do not expose production route documentation without a separate username/password.
const username = process.env.SWAGGER_USERNAME || '';
const password = process.env.SWAGGER_PASSWORD || '';
const credentialsReady = username.length > 0 && password.length >= 12;
const available = enabled && (!isProduction || credentialsReady);

function constantTimeEqual(a, b) {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function guard(req, res, next) {
  // If credentials were configured, require them in dev as well.
  if (!credentialsReady) return next();
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    } catch {
      // Invalid credentials will trigger the Basic challenge below.
    }
    const separator = decoded.indexOf(':');
    if (separator > -1 && constantTimeEqual(decoded.slice(0, separator), username) && constantTimeEqual(decoded.slice(separator + 1), password)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="PlantHub API documentation", charset="UTF-8"');
  return res.status(401).send('Swagger authentication required');
}

export function mountSwagger(app) {
  if (!available) return;
  // Mounted before global Helmet to avoid Swagger UI's inline style CSP conflicts.
  app.get('/api-docs/openapi.json', guard, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(openApiSpec);
  });
  app.use('/api-docs', guard, swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'PlantHub | API Docs',
    explorer: true,
    swaggerOptions: {
      filter: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      persistAuthorization: false,
    },
  }));
}
