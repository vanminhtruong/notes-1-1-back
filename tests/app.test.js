process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/db');

describe('Health check', () => {
  it('GET /api/health should return ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Sample routes', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await sequelize.truncate({ cascade: true });
  });
  it('POST /api/v1/sample validates body', async () => {
    const res = await request(app).post('/api/v1/sample').send({});
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/sample creates item', async () => {
    const res = await request(app).post('/api/v1/sample').send({ name: 'A' });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.name).toBe('A');
    expect(res.body.data.id).toBeTruthy();
  });
});
