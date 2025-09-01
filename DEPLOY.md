# Deploy Backend to Render

## Hướng dẫn Deploy dự án lên Render.com

### 1. Chuẩn bị

1. **Push code lên GitHub repository**
2. **Tạo tài khoản trên Render.com**
3. **Kết nối GitHub với Render**

### 2. Các file cấu hình đã tạo

- `render.yaml` - Cấu hình deploy chính
- `.env.production` - Environment variables cho production
- Đã cập nhật `package.json` với scripts tối ưu
- Đã cập nhật database config cho production

### 3. Deploy Steps

#### Option 1: Sử dụng render.yaml (Recommended)

1. **Commit và push tất cả files**:
   ```bash
   git add .
   git commit -m "Add Render deployment config"
   git push origin main
   ```

2. **Trên Render Dashboard**:
   - Click "New" → "Blueprint"
   - Connect GitHub repository
   - Chọn repository của dự án
   - Render sẽ tự động detect `render.yaml` và deploy

#### Option 2: Manual Setup

1. **Trên Render Dashboard**:
   - Click "New" → "Web Service"
   - Connect GitHub repository
   - Chọn branch `main`

2. **Configuration**:
   - **Name**: `plant-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm ci`
   - **Start Command**: `npm start`
   - **Plan**: `Starter` (free tier)

3. **Environment Variables**:
   ```
   NODE_ENV=production
   PORT=10000
   JWT_SECRET=[generate random secret]
   JWT_EXPIRES_IN=7d
   CLIENT_URL=[your frontend URL]
   CORS_ORIGIN=[your frontend URL]
   SEQUELIZE_LOG=false
   SQLITE_STORAGE=/opt/render/project/src/data/app.sqlite
   ```

4. **Persistent Disk** (Important cho SQLite):
   - Trong Advanced settings
   - Add Disk: `plant-backend-disk`
   - Mount Path: `/opt/render/project/src/data`
   - Size: `1 GB`

### 4. Environment Variables cần set

| Variable | Value | Description |
|----------|--------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `10000` | Render default port |
| `JWT_SECRET` | `[generate secure key]` | JWT signing secret |
| `CLIENT_URL` | `https://your-frontend.onrender.com` | Frontend URL |
| `CORS_ORIGIN` | `https://your-frontend.onrender.com` | CORS allowed origin |

### 5. Sau khi Deploy

1. **Kiểm tra logs**: Monitor deployment logs
2. **Test API endpoints**: Verify health endpoint `/api/health`
3. **Database**: SQLite sẽ được tạo tự động trong persistent disk
4. **Update frontend**: Cập nhật API_BASE_URL trong frontend

### 6. Troubleshooting

#### Database Issues
- Ensure persistent disk được mount đúng path
- Kiểm tra SQLITE_STORAGE environment variable

#### CORS Issues
- Verify CLIENT_URL và CORS_ORIGIN đúng
- Ensure không có trailing slash

#### Environment Variables
- Kiểm tra tất cả required env vars được set
- JWT_SECRET phải được generate secure

### 7. Post-deployment

1. **Update Frontend Config**:
   ```typescript
   // In Frontend src/services/api.ts
   const API_BASE_URL = 'https://your-backend-name.onrender.com/api/v1';
   ```

2. **Health Check**:
   ```
   GET https://your-backend-name.onrender.com/api/health
   ```

### 8. Notes

- **Free tier sleep**: Service sẽ sleep sau 15 phút không hoạt động
- **Cold start**: Có thể mất 30-60s để wake up
- **Database**: SQLite data được persist trong disk
- **Logs**: Available trong Render dashboard
