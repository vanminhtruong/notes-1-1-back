# Chat: chạy, kiểm tra và mở rộng

Thay đổi hiện tại là bước giảm tải cho ứng dụng một backend process. Chưa có bằng chứng ứng dụng chịu được 500.000–1.000.000 người đồng thời. Các test mô phỏng kiểm tra tính đúng của giới hạn tải, không đo năng lực hạ tầng.

## Cấu hình hiện có

- `CHAT_MAX_IN_FLIGHT=64`: tổng HTTP chat/group request đang xử lý mỗi process.
- `CHAT_MAX_IN_FLIGHT_PER_USER=4`: HTTP request đồng thời mỗi tài khoản mỗi process.
- `CHAT_MAX_CONNECTING=16`: số lượt xác thực + khởi tạo socket đồng thời.
- `CHAT_MAX_SOCKET_WORK=128`: số tác vụ socket DM/group đang xử lý mỗi process; tối đa 4 tác vụ/socket.
- Socket nhận tối đa 256 KiB/packet, ngân sách 40 event/giây, burst 80, typing cùng đối tượng được gộp trong 1 giây. Không dùng socket để tải file.
- HTTP quá tải trả `503`, `code: CHAT_BUSY`, `Retry-After: 2`. Socket bị từ chối lúc kết nối được Front thử lại sau khoảng chờ ngẫu nhiên. Event socket vượt ngân sách bị bỏ; tin nhắn bền vững vẫn gửi qua HTTP, không tự động gửi lại POST để tránh trùng tin.

Giới hạn trên là giá trị khởi đầu để đo trên staging, không phải thông số đã xác nhận cho production. Các giới hạn này không thay thế rate limiter phân tán tại gateway, và hiện được áp dụng sau HTTP authentication.

## Thay đổi mã nguồn

- Front dùng chung socket cho chat, cuộc gọi và cập nhật ghi chú; tái sử dụng trong lúc đang kết nối/reconnect và thay kết nối khi token đổi.
- Thêm jitter/backoff reconnect; gộp tải lại danh sách chat/thông báo trong 250 ms và giữ một lần tải tiếp nếu có thay đổi giữa lúc request đang chạy.
- Giữ trạng thái `read` khi một sự kiện `delivered` đến trễ.
- Đăng ký cleanup trước công việc kết nối bất đồng bộ; không khởi tạo lại backlog/presence cho mỗi tab bổ sung.
- Backlog delivery đọc 200 bản ghi/lô theo ID và cập nhật theo lô, không tải toàn bộ lịch sử vào RAM. Trạng thái `read` không bị SQL delivery ghi đè.
- Group history tải thông tin người gửi và danh sách thành viên một lần/request, cập nhật `isRead` theo lô.
- Admin nhận sự kiện qua room dành cho admin đã xác thực. Thu hồi role/vô hiệu hóa tài khoản loại socket khỏi room này.

## Kiểm tra và migration

Từ `back`, với `NODE_ENV=test`:

```text
node --test tests/chat-capacity.node-test.js tests/chat-delivery.node-test.js tests/admin-presence.node-test.js tests/admin-permissions-realtime.node-test.js
```

Từ `Front`:

```text
node --test tests/chat-performance.test.mjs
npm run build
node scripts/chat-load.mjs --help
```

Migration `20261030-chat-delivery-indexes.js` bổ sung index cho truy vấn backlog. Model cũng khai báo index cho database mới. Chưa chạy migration lên dữ liệu người dùng. Backup và chạy thử trên bản sao dữ liệu trước khi dùng quy trình migration hiện có; quy trình hiện tại chạy lại mọi migration, nên phải rà soát các migration cũ trước khi chạy trên production.

## Kiểm thử tải staging

`Front/scripts/chat-load.mjs` tạo kết nối socket và đọc unread count với ramp-up, khoảng nghỉ ngẫu nhiên và giới hạn thời gian. Cấp `CHAT_LOAD_URL`, `CHAT_LOAD_TOKENS_FILE` (file JSON gồm JWT của tài khoản thử nghiệm), `CHAT_LOAD_CLIENTS`, `CHAT_LOAD_SECONDS`, `CHAT_LOAD_RAMP_MS` qua biến môi trường. Không commit file token. Script không gửi tin nhắn, không ghi nội dung chat ra log và không tự động chạy tải lớn.

Kết quả chỉ đại diện cho workload đọc/kết nối. Cần một bài kiểm thử riêng cho gửi tin, fan-out nhóm, đọc/nhận tin, reconnect đồng loạt, nhiều thiết bị, thu hồi quyền và phục hồi khi mất node. Đo lỗi, độ trễ p95/p99, CPU/RAM, event-loop lag, kết nối DB, thời gian truy vấn, backlog và số tin bị trùng/mất. Tài khoản, database, nhóm và lịch sử phải có phân bố sát thực tế; lặp lại một JWT không tương đương nhiều người dùng độc lập.

## Điều kiện còn thiếu cho quy mô triệu người

1. SQLite hiện tại cần được thay bằng datastore có năng lực ghi đồng thời phù hợp; chuẩn bị migration schema/dữ liệu và kiểm tra mọi raw SQL phụ thuộc SQLite trước khi chuyển. Bổ sung connection pool có giới hạn, phân vùng lịch sử và kế hoạch sao lưu/khôi phục.
2. Chạy nhiều socket/API node sau load balancer. Cần adapter và presence dùng chung; không thể chỉ nhân bản process hiện tại vì `connectedUsers`, kiểm tra online và cuộc gọi vẫn có trạng thái cục bộ.
3. Chọn Redis adapter/Streams theo yêu cầu khôi phục, đồng thời bổ sung outbox/queue bền vững cho delivery và fan-out, idempotency key khi gửi tin, catch-up từ lịch sử sau reconnect. Redis Pub/Sub đơn thuần không bảo đảm phát lại sự kiện đã mất.
4. Tách reminder/migration khỏi các API replica; chạy migration một lần trong pipeline. Thiết lập giới hạn thành viên nhóm và chiến lược fan-out cho nhóm lớn. Các luồng đọc hiện vẫn dùng offset và có side effect read receipt, cần chuyển dần sang cursor và receipt theo watermark.
5. Edge rate limit phân tán, admission control cho authentication, autoscaling theo tải đo được, quan sát hệ thống và thử nghiệm lỗi. Chỉ công bố mức đồng thời sau thử tải phân tán trên hạ tầng đích với tiêu chí đạt đã thống nhất.

Tài liệu chính thức: [Socket.IO nhiều node](https://socket.io/docs/v4/using-multiple-nodes/), [Redis adapter](https://socket.io/docs/v4/redis-adapter/). Nếu giữ HTTP polling khi chạy nhiều node, cấu hình sticky sessions theo tài liệu; adapter không tự thay thế việc đó.
