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
# Sao lưu SQLite khi phát triển

Mỗi lần chạy `npm run dev`, npm tự chạy `predev`: nếu thiếu thư viện thì tự chạy
`npm install --include=dev`, nếu đã đủ thì bỏ qua. Sau đó khôi phục khi thiếu
database và sao lưu database hiện có trước khi khởi động nodemon. Nodemon tự restart khi sửa code sẽ không tạo thêm
bản sao. Có thể sao lưu thủ công bằng `npm run db:backup`.

- Trên Windows, mặc định lưu tại `E:\PlantHub-backups\backend`, ngoài dự án. Trên hệ điều hành khác, mặc định dùng `<thư mục người dùng>/PlantHub-backups/backend`.
- Tùy chỉnh `SQLITE_BACKUP_DIR` bằng đường dẫn tuyệt đối ngoài backend trong `.env`.
- `SQLITE_BACKUP_KEEP=14` giữ 14 bản gần nhất cho từng đường dẫn database.
- Dùng SQLite `VACUUM INTO` để lấy snapshot nhất quán, bao gồm dữ liệu WAL đã
  commit; kiểm tra `integrity_check` trước khi giữ bản mới và dọn bản cũ.
- Nếu chưa có database trong dự án, tự tìm bản sao mới nhất hợp lệ tại thư mục backup và **sao chép** về `SQLITE_STORAGE`, kể cả khi clone sang đường dẫn mới. Giữ nguyên bản sao ở ổ E và không ghi đè database đã có. Bản hỏng được bỏ qua để thử bản cũ hơn; nếu tất cả bản sao đều hỏng thì dừng. Nếu không có bản sao nào thì cho phép tạo database mới. Nếu backup lỗi, `npm run dev` dừng để bạn
  xử lý thay vì tiếp tục khi chưa có bản sao. Log hiển thị đường dẫn bản sao.
- Không tự chạy sync/migration hoặc sửa dữ liệu nguồn trong bước backup.
- Đây là backup trên cùng máy; cần đồng bộ thư mục backup sang ổ khác hoặc dịch
  vụ lưu trữ riêng để phòng mất/hỏng máy. Không đưa dữ liệu thật lên GitHub.

Khôi phục: dừng tất cả tiến trình backend đang dùng database, giữ lại database
hiện tại cùng các file `-wal`/`-shm` ở thư mục riêng để có thể quay lại. Chép bản
backup mong muốn đến đường dẫn `SQLITE_STORAGE` (mặc định `data/app.sqlite`),
không để các file `-wal`/`-shm` cũ bên cạnh database vừa khôi phục, rồi khởi động
backend. Bản sao chỉ chứa dữ liệu SQLite, không chứa file tải lên trong
`public/uploads`; cần sao lưu thư mục này riêng nếu muốn khôi phục đầy đủ tệp đính kèm.

Kiểm tra snapshot WAL, khôi phục và giới hạn bản sao bằng `npm run test:backup`
(chỉ dùng database thử trong thư mục tạm).
