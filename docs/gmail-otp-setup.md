# PlantHub — OTP khôi phục mật khẩu qua Gmail thật

Ứng dụng **đã có luồng email OTP** cho người dùng đăng ký tài khoản. Backend dùng Nodemailer và Gmail SMTP. Hiện chỉ còn việc chủ dự án tự cấu hình thông tin đăng nhập của **tài khoản Gmail dùng để gửi**.

## 1. Gmail gửi OTP

1. Đăng nhập tài khoản Gmail mà bạn muốn dùng làm người gửi (ví dụ `support@...` không nhất thiết là Gmail; với cách này cần địa chỉ `@gmail.com` hợp lệ).
2. Bật **Xác minh 2 bước** trong tài khoản Google: https://myaccount.google.com/security
3. Tạo **Mật khẩu ứng dụng** tại https://myaccount.google.com/apppasswords (chỉ hiển thị khi tài khoản đủ điều kiện; không phải mật khẩu Gmail thông thường).
4. Mở file **`back/.env`** ngay trên máy bạn và điền:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-sender@gmail.com
SMTP_PASS=YOUR_16_CHARACTER_APP_PASSWORD
SMTP_FROM=
```

Để `SMTP_FROM=` trống sẽ tự dùng `PlantHub <SMTP_USER>`. Không thêm các thông tin bí mật này vào Front Users, Admins, GitHub hay cuộc trò chuyện.

5. Khởi động lại Backend để nạp `.env`.

## 2. Kiểm tra kết nối SMTP (không gửi email)

```powershell
cd C:\Users\ASUS\Documents\plant\duan\back
node scripts/verifyEmail.js
```

Thông báo `SMTP connection and authentication verified` cho biết Gmail SMTP cho phép đăng nhập, **chưa chứng minh thư đã đến Inbox**.

## 3. Thử chức năng

- Tài khoản PlantHub cần có email đăng ký còn hoạt động.
- Tại Front Users → **Quên mật khẩu → Email**, nhập đúng email đã đăng ký, nhấn gửi OTP.
- Kiểm tra **Inbox** của chính email đó; nếu không thấy, kiểm tra **Spam/Quảng cáo**.
- Nhập OTP gồm 6 chữ số trong 10 phút và đặt mật khẩu mới.
- Đối với email không tồn tại, API vẫn trả thông báo chung để hạn chế dò tài khoản; sẽ không gửi thư.

## 4. Bảo mật

- Mã OTP được sinh trên Backend, chỉ lưu băm bcrypt và hết hạn sau 10 phút.
- Sau 5 lần nhập sai sẽ vô hiệu; gửi lại tối thiểu 60 giây và không quá 5 lần trong một giờ.
- API chỉ trả thành công khi máy chủ SMTP chấp nhận người nhận (việc Gmail đưa đến Inbox/Spam còn phụ thuộc bộ lọc).
- Không dùng mật khẩu đăng nhập Gmail thông thường trong `SMTP_PASS`.
- GitHub Pages chỉ là Frontend; muốn gửi email từ Pages cần Backend HTTPS hoạt động.
- Nếu tài khoản không có tùy chọn Mật khẩu ứng dụng (chính sách Google Workspace, bảo vệ nâng cao...), cần sử dụng phương án SMTP provider khác / OAuth2.
