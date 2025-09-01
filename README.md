# Express.js Starter

A fully configured Express.js project with best practices: routing, middlewares, env handling, linting, Prettier, tests, Docker, and a Sequelize + SQLite database.

## Scripts
- dev: Start dev server with nodemon
- start: Start production server
- lint / lint:fix: ESLint
- format: Prettier
- test / test:watch: Jest tests

## Getting Started
1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in dev:
   ```bash
   npm run dev
   ```
4. Run tests:
   ```bash
   npm test
   ```

## Database (Sequelize + SQLite)
- Config is in `src/db/index.js` using SQLite by default.
- Storage path is controlled by `SQLITE_STORAGE` in `.env` (default: `./data/app.sqlite`).
- In tests (`NODE_ENV=test`), an in-memory database `:memory:` is used automatically.
- Models live under `src/models/`. Example model: `Sample` in `src/models/sample.model.js`.
- DB is synced on server start in `src/server.js` via `sequelize.sync()`.

Example API using DB:

## API
- GET `/api/health` — health check
- GET `/api/v1/sample` — list sample items
- POST `/api/v1/sample` — create item `{ name: string }`

## Docker
Build and run:
```bash
docker build -t expressjs-starter .
docker run -p 3000:3000 --env-file .env expressjs-starter
```
