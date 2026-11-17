import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const routeDir = fileURLToPath(new URL('../routes/v1/', import.meta.url));

const routeGroups = [
  ['auth.route.js', '/auth', 'Authentication'],
  ['notes.route.js', '/notes', 'Notes & Categories'],
  ['friendship.route.js', '/friends', 'Friends'],
  ['chat.route.js', '/chat', 'Chat'],
  ['upload.route.js', '/uploads', 'Uploads'],
  ['group.route.js', '/groups', 'Groups'],
  ['settings.route.js', '/settings', 'Settings'],
  ['blocks.route.js', '/blocks', 'Blocked Users'],
  ['notifications.route.js', '/notifications', 'Notifications'],
  ['admin.route.js', '/admin', 'Admin'],
  ['userSession.route.js', '/sessions', 'Sessions'],
  ['admin/admin.backgrounds.route.js', '/admin/backgrounds', 'Admin Backgrounds'],
];

const jsonObject = { type: 'object', additionalProperties: true };
const jsonResponse = { description: 'JSON response', content: { 'application/json': { schema: jsonObject } } };
const errorResponses = {
  400: { description: 'Invalid input' },
  401: { description: 'Authentication required or invalid token' },
  403: { description: 'Insufficient permissions' },
  404: { description: 'Resource not found' },
  500: { description: 'Server error' },
};

const schema = (required, properties) => ({ type: 'object', required, properties, additionalProperties: false });
const string = { type: 'string' };
const phone = { type: 'string', example: '+84912345678' };
const login = schema(['email', 'password'], {
  email: { type: 'string', format: 'email' },
  password: { type: 'string', format: 'password' },
  remember: { type: 'boolean' },
});
const specialBodies = {
  '/auth/register': schema(['name', 'email', 'password'], {
    name: string, email: { type: 'string', format: 'email' },
    password: { type: 'string', format: 'password' },
    phone, birthDate: { type: 'string', format: 'date', nullable: true },
    gender: { type: 'string', enum: ['male', 'female', 'other', 'unspecified'] },
  }),
  '/auth/login': login,
  '/admin/login': login,
  '/auth/forgot-password': schema([], { email: { type: 'string', format: 'email' }, phone }),
  '/auth/verify-otp': schema(['otp'], { email: { type: 'string', format: 'email' }, phone, otp: { type: 'string', example: '123456' } }),
  '/auth/reset-password': schema(['newPassword'], {
    email: { type: 'string', format: 'email' }, phone,
    otp: { type: 'string' }, resetToken: { type: 'string', description: 'Token returned by SMS OTP verification' },
    newPassword: { type: 'string', format: 'password' },
  }),
  '/auth/remember-pref': schema(['email'], { email: { type: 'string', format: 'email' } }),
  '/auth/change-password': schema(['currentPassword', 'newPassword'], {
    currentPassword: { type: 'string', format: 'password' },
    newPassword: { type: 'string', format: 'password' },
  }),
  '/auth/profile': schema([], {
    name: string, avatar: { type: 'string', format: 'uri', nullable: true },
    phone: { ...phone, nullable: true },
    birthDate: { type: 'string', format: 'date', nullable: true },
    gender: { type: 'string', enum: ['male', 'female', 'other', 'unspecified'] },
  }),
  '/notes': schema(['title'], { title: string, content: string, categoryId: { type: 'integer' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } }),
  '/notes/categories': schema(['name'], { name: string, color: string, icon: string }),
  '/notes/folders': schema(['name'], { name: string }),
  '/notes/tags': schema(['name'], { name: string }),
  '/settings/privacy': schema([], { hidePhone: { type: 'boolean' }, hideBirthDate: { type: 'boolean' }, allowMessagesFromNonFriends: { type: 'boolean' } }),
};

function publicEndpoint(group, route, method) {
  if (group === 'Authentication') {
    return ['/register', '/login', '/google', '/facebook', '/forgot-password', '/verify-otp', '/reset-password', '/remember-pref'].includes(route)
      && method === 'post';
  }
  return group === 'Admin' && route === '/login' && method === 'post';
}

function extractRoutes(contents) {
  const routeCall = /\brouter\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
  return [...contents.matchAll(routeCall)].map((match) => ({ method: match[1], path: match[3] }));
}

function pathParameters(route) {
  return [...route.matchAll(/:([a-zA-Z]\w*)/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function commonQueryParams(group, route, method) {
  if (method !== 'get') return [];
  if (group === 'Notes & Categories' && (route === '/categories/search' || route === '/folders/search/all')) {
    return [{ name: 'q', in: 'query', required: false, schema: string, description: 'Search term' }];
  }
  return [];
}

export function buildOpenApiSpec() {
  const paths = {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'API health check',
        responses: { 200: jsonResponse },
      },
    },
  };
  for (const [filename, prefix, tag] of routeGroups) {
    const contents = fs.readFileSync(path.join(routeDir, filename), 'utf8');
    for (const { method, path: route } of extractRoutes(contents)) {
      const routePath = (prefix + (route === '/' ? '' : route)).replace(/\/{2,}/g, '/');
      const apiPath = '/api/v1' + routePath.replace(/:([a-zA-Z]\w*)/g, '{$1}');
      const secured = !publicEndpoint(tag, route, method);
      const operation = {
        tags: [tag],
        summary: method.toUpperCase() + ' ' + routePath,
        operationId: (method + '_' + routePath).replace(/[^a-zA-Z0-9]+/g, '_'),
        ...(secured ? { security: [{ bearerAuth: [] }] } : { security: [] }),
        responses: {
          200: jsonResponse,
          ...(method === 'post' ? { 201: jsonResponse } : {}),
          ...errorResponses,
        },
      };
      const parameters = [...pathParameters(route), ...commonQueryParams(tag, route, method)];
      if (parameters.length) operation.parameters = parameters;
      if (!['get', 'delete'].includes(method)) {
        if (tag === 'Uploads' || (tag === 'Admin' && route === '/upload/image')) {
          operation.requestBody = {
            required: true,
            content: { 'multipart/form-data': { schema: schema(['file'], { file: { type: 'string', format: 'binary' } }) } },
          };
        } else {
          operation.requestBody = {
            required: false,
            description: specialBodies[routePath]
              ? 'Request body. See schema for supported fields.'
              : 'JSON body. The route validator may require additional fields; consult the backend validator for exact constraints.',
            content: { 'application/json': { schema: specialBodies[routePath] || jsonObject } },
          };
        }
      }
      paths[apiPath] ||= {};
      paths[apiPath][method] = operation;
    }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'PlantHub Backend API',
      version: '1.0.0',
      description: [
        'Swagger for the existing Express REST routes. Select an endpoint, click **Try it out**, then **Execute**.',
        'For protected endpoints, first use POST /api/v1/auth/login and copy its token into **Authorize** (Bearer JWT).',
        'Admin operations need admin credentials and permissions; normal user tokens cannot bypass backend authorization.',
        'Route inventory is generated from backend route declarations; generic JSON schemas do not replace server-side validation.',
        'Warning: write and delete operations act on the connected database. Test with a non-production account.',
      ].join('\\n\\n'),
    },
    servers: [{ url: '/', description: 'Current backend host' }],
    tags: ['System', ...new Set(routeGroups.map((x) => x[2]))].map((name) => ({ name })),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths,
  };
}

export const openApiSpec = buildOpenApiSpec();
