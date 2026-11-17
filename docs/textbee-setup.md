# PlantHub — SMS OTP qua textbee

Tài liệu API chính thức: https://textbee.dev/docs/sending-sms/sending-sms

## Thiết lập tài khoản (không cần xác minh DNS GitHub Pages)

1. Đăng ký tại https://textbee.dev/ và xác minh email tài khoản.
2. Cài ứng dụng textbee lên điện thoại Android có SIM. Đăng nhập/ghép điện thoại với tài khoản theo hướng dẫn https://textbee.dev/docs/getting-started/setting-up-textbee.
3. Cấp quyền gửi SMS trên Android và cho phép ứng dụng hoạt động nền. Giữ điện thoại kết nối Internet và SIM hoạt động. Chọn điện thoại làm **default device** trong dashboard.
4. Trong dashboard textbee, tạo API key. Chỉ lưu key trong file Backend `back/.env` như sau:
   ```env
   TEXTBEE_API_KEY=<your-private-key>
   ```
5. Khởi động lại Backend. Không đặt khóa vào Front Users, Front Admins hay GitHub Pages.
6. Thử quên mật khẩu bằng số điện thoại trùng với thông tin tài khoản PlantHub. Mã OTP sáu chữ số có hiệu lực 10 phút; sai tối đa năm lần. Mỗi tài khoản có giới hạn 60 giây gửi lại và năm yêu cầu mỗi giờ.

## API & trạng thái
Backend gọi `POST https://api.textbee.dev/api/v1/gateway/send-sms` với header `x-api-key`. Không truyền `deviceId` vì dùng thiết bị mặc định của tài khoản textbee. API HTTP 200 chỉ có nghĩa tin nhắn đã được nhận vào hàng đợi, không bảo đảm đã đến máy người nhận. Trạng thái gửi thực tế xem trong textbee dashboard / lịch sử SMS trên điện thoại.

Backend sinh OTP cục bộ từ nguồn ngẫu nhiên, chỉ lưu băm bcrypt trong bảng `PasswordResets`. Khi xác minh đúng, Backend cấp token ngắn hạn dùng một lần để đặt lại mật khẩu. Email OTP cũ vẫn hoạt động độc lập.

Nếu chưa cấu hình API key, thiết bị chưa kết nối hoặc hết quota, Backend trả lỗi rõ ràng, không tạo OTP giả. API textbee không cần xác minh DNS hay tạo project website như eOTP.

## Kiểm thử
```powershell
cd C:\Users\ASUS\Documents\plant\duan\back
node --test tests/textbee.node-test.js
node --check src/service/auth-service/auth.password-reset.service.js
```

## Chi phí
Gói miễn phí textbee có hạn mức theo điều kiện hiện hành; không bao gồm cước gửi SMS của SIM. Một số gói thuê bao nhà mạng chặn SMS tự động hoặc có giới hạn chống spam. Đừng coi đây là SMS vô hạn hay miễn phí tuyệt đối nếu SIM tính tiền.

## Lưu ý triển khai
Github Pages chỉ host Front Users/Front Admins. Cần Backend HTTPS chạy trực tuyến để giao diện quên mật khẩu gọi API và textbee. Biến `TEXTBEE_API_KEY` là secret phía server.
