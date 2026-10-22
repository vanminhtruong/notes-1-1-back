# Tầng Repository

Thư mục này chứa **lớp truy cập dữ liệu (Data Access Layer)** của backend.
Toàn bộ tầng `service` truy cập cơ sở dữ liệu thông qua repository thay vì
gọi trực tiếp Sequelize model.

## Cấu trúc

- `base.repository.js` – lớp cơ sở `BaseRepository`, uỷ quyền nguyên vẹn cho
  Sequelize model: `findByPk`, `findOne`, `findAll`, `findAndCountAll`,
  `count`, `create`, `update`, `destroy`, `increment`, `findOrCreate`, ...
  cùng các query builder `fn`, `col`, `literal`, `where`, `sequelize`,
  `transaction`, `query`.
- `<model>.repository.js` – một repository cho mỗi model (ví dụ
  `user.repository.js`, `note.repository.js`), kế thừa `BaseRepository` và bổ
  sung các truy vấn đặc thù dưới dạng phương thức có ngữ nghĩa.
- `index.js` – barrel export tất cả repository dưới dạng singleton.

## Quy ước sử dụng trong service

```js
import { userRepository, noteRepository } from '../../repositories/index.js';

const user = await userRepository.findByEmail(email);
const { count, rows } = await noteRepository.findAndCountAll({ where, include });
```

Ghi chú:

- Repository trả về **đúng instance Sequelize** như model, nên các phương thức
  instance (`.update()`, `.save()`, `.destroy()`, `.validatePassword()`)
  vẫn hoạt động bình thường.
- Association (`include: [{ model: User, as: 'user' }]`) vẫn cần model class,
  nên service có thể import model từ `../models/index.js` chỉ cho mục đích này.
- Vì `BaseRepository` chỉ uỷ quyền, việc chuyển service sang repository **không
  thay đổi hành vi** so với gọi model trực tiếp.

## Thêm truy vấn mới

Khi một truy vấn được dùng lại ở nhiều nơi, hãy thêm một phương thức có ngữ
nghĩa vào repository tương ứng thay vì lặp lại `where` trong service.
