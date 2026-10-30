# PlantHub backend

Backend dùng chung cho dự án Front và admin: Express, Socket.IO, Sequelize và SQLite. Mã nguồn dùng ES modules.

## Khởi động và kiểm tra

- Sao chép cấu hình từ `.env.example` sang `.env`; không commit thông tin xác thực.
- `npm ci`: cài đúng phiên bản trong lockfile.
- `npm run dev`: chuẩn bị dependency, khôi phục/backup database theo cấu hình rồi chạy nodemon.
- `npm start`: chạy server; server khởi tạo schema qua `scripts/modelManager.js` và bật scheduler nhắc việc.
- `npm test`: chạy toàn bộ test qua Node test runner, tự đặt `NODE_ENV=test` trước khi import để dùng database bộ nhớ.
- `npm run test:watch`: theo dõi và chạy lại test khi sửa mã.
- `npm run test:email` / `npm run test:backup`: chạy riêng nhóm test.
- `npm run lint`: kiểm tra ESLint; các cảnh báo cũ không đồng nghĩa API không hoạt động.

## Phân chia trách nhiệm

- `src/routes`: khai báo URL, middleware xác thực/phân quyền và validation.
- `src/controllers`: đầu vào HTTP và điều phối tới service; không thêm truy vấn nghiệp vụ mới ở route.
- `src/service/<domain>-service`: nghiệp vụ theo nhóm chức năng. Giữ tên đường dẫn hiện có để tránh làm hỏng import.
- `src/repositories`: truy cập dữ liệu dùng chung; `src/models` chứa schema và liên kết Sequelize.
- `src/socket`: quản lý kết nối và signaling realtime, chia handler theo chat/group/call/notes/friends/admin.
- `src/middlewares`, `src/validators`, `src/utils`: xử lý xuyên suốt và helper.
- `src/db`, `src/migrations`, `scripts`: vận hành database, backup, SMTP và tác vụ dòng lệnh; không xóa chỉ vì giao diện không gọi trực tiếp.
- `tests`: regression test bằng `node:test`, chạy độc lập theo file.

Đây là phân lớp hiện có, chưa phải cấu trúc domain module hoàn toàn: một số controller/service cũ vẫn gọi model trực tiếp. Các đợt sửa tiếp theo nên chuyển từng luồng sang repository kèm test, tránh đổi đồng loạt khi chưa có test đầy đủ cho toàn bộ nghiệp vụ.

## API và realtime

- `GET /api/health`: trạng thái ứng dụng.
- `/api/v1` có các nhóm `auth`, `notes`, `friends`, `chat`, `uploads`, `groups`, `settings`, `blocks`, `notifications`, `admin`, `sessions`.
- Route chi tiết nằm ở `src/routes/v1`. Admin chat settings đang nằm trong `admin.route.js` và service admin; không phụ thuộc các file placeholder rỗng đã dọn.
- Socket.IO gắn vào cùng HTTP server trong `src/server.js`. Các sự kiện gọi điện, E2EE, chat, presence và thông báo vẫn thuộc nghiệp vụ cần giữ.
- Dữ liệu SQLite nằm tại `SQLITE_STORAGE` (mặc định `data/app.sqlite`); tệp đính kèm tại `public/uploads`. Không đưa chúng lên Git.
- Chỉ chạy lệnh sync/migration/reset khi đã backup và hiểu tác động. Test không khởi chạy server production hay migration lên dữ liệu thật.

## Docker

`docker build -t planthub-back .` rồi chạy với file môi trường và volume bền vững cho database/uploads. Không dùng filesystem tạm của container để giữ dữ liệu thật.

Xem [cấu hình và giới hạn mở rộng chat](docs/chat-scaling.md).

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

## Email đặt lại mật khẩu

Frontend gọi API Forgot Password; backend gửi mã OTP đến email của tài khoản đã
đăng ký và còn hoạt động. Tài khoản gửi được cấu hình riêng trong `.env` bằng
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
Không commit `.env` hoặc thông tin xác thực SMTP. `SMTP_FROM` phải là địa chỉ gửi đã được dịch vụ xác minh, không phải SMTP login kỹ thuật.

Chạy `npm run email:verify` để kiểm tra kết nối và xác thực SMTP (không gửi thư).
Chạy `npm run test:email` để kiểm tra xử lý cấu hình và kết quả gửi thư bằng
transport giả. Thiếu cấu hình hoặc gửi thất bại sẽ trả lỗi, không giả lập đã gửi
qua console. SMTP chấp nhận email chưa đảm bảo thư đã vào Inbox; kiểm tra cả
Spam khi thử gửi thật. Sau khi đổi `.env`, khởi động lại backend.

### Thiết lập bằng Brevo (không dùng mật khẩu Gmail)

1. Đăng ký/đăng nhập tại https://onboarding.brevo.com và hoàn tất thông tin tài khoản.
2. Trong Settings > Senders, Domains, IPs > Senders, thêm người gửi PlantHub và
   xác minh địa chỉ email bằng mã được gửi đến hộp thư của bạn.
3. Trong Settings > SMTP & API > SMTP, lấy SMTP login và SMTP key của Brevo.
   SMTP key khác API key và khác mật khẩu đăng nhập Gmail.
4. Điền vào `.env`: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`,
   `SMTP_SECURE=false`, `SMTP_USER=<SMTP login>`, `SMTP_PASS=<SMTP key>`,
   `SMTP_FROM="PlantHub <địa chỉ gửi đã xác minh>"`.
5. Chạy `npm run email:verify`, khởi động lại backend rồi thử Forgot Password
   bằng email của tài khoản PlantHub đã đăng ký. Kiểm tra cả Inbox và Spam.

Địa chỉ nhận OTP là email của người dùng trong database, không cố định là
email quản trị viên. Không cần bật xác minh hai bước của Gmail cho cách này.
Brevo có thể yêu cầu xét duyệt tài khoản và xác thực tên miền trước khi cho
phép gửi; SMTP verify thành công chưa đảm bảo thư được giao đến người nhận.
Hướng dẫn: https://developers.brevo.com/docs/smtp-integration và
https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email
