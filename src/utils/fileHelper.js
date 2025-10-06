import fs from 'fs';
import path from 'path';

/**
 * Kiểm tra xem URL có phải là file từ thư mục uploads không
 * Xử lý cả full URL (http://localhost:3000/uploads/...) và relative path (/uploads/...)
 * @param {string} fileUrl - URL hoặc path của file
 * @returns {boolean} - true nếu là file từ uploads, false nếu không
 */
export const isUploadedFile = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== 'string') {
    return false;
  }
  return fileUrl.includes('/uploads/');
};

/**
 * Kiểm tra xem message có chứa file upload cần xóa không
 * @param {Object} msg - Message object với messageType và content
 * @returns {boolean} - true nếu message có file upload, false nếu không
 */
export const hasUploadedFile = (msg) => {
  if (!msg || !msg.content) {
    return false;
  }
  // Hỗ trợ cả video upload
  if (msg.messageType !== 'image' && msg.messageType !== 'file' && msg.messageType !== 'video') {
    return false;
  }
  return isUploadedFile(msg.content);
};

/**
 * Xóa file upload từ filesystem
 * @param {string} fileUrl - URL của file cần xóa (vd: /uploads/image-123.jpg)
 * @returns {boolean} - true nếu xóa thành công, false nếu không
 */
export const deleteUploadedFile = (fileUrl) => {
  console.log('[FileHelper] deleteUploadedFile called with:', fileUrl);
  
  if (!fileUrl || typeof fileUrl !== 'string') {
    console.log('[FileHelper] Invalid fileUrl, skipping');
    return false;
  }

  try {
    // Xử lý cả full URL và relative path
    let pathToCheck = fileUrl;
    
    // Nếu là full URL (http://... hoặc https://...), extract path
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      try {
        const urlObj = new URL(fileUrl);
        pathToCheck = urlObj.pathname; // Lấy /uploads/...
        console.log('[FileHelper] Extracted path from full URL:', pathToCheck);
      } catch (e) {
        console.log('[FileHelper] Invalid URL format, skipping');
        return false;
      }
    }
    
    // Check if it's from uploads folder
    if (!pathToCheck.startsWith('/uploads/')) {
      console.log('[FileHelper] Not from /uploads/, skipping. Path:', pathToCheck);
      return false;
    }

    // Extract filename from path (remove /uploads/ prefix)
    const filename = pathToCheck.replace(/^\/uploads\//, '');
    
    // Build full path
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadsDir, filename);
    
    console.log('[FileHelper] Uploads dir:', uploadsDir);
    console.log('[FileHelper] File path to delete:', filePath);

    // Check if file exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[FileHelper] ✅ Successfully deleted file: ${filename}`);
      return true;
    } else {
      console.log(`[FileHelper] ❌ File not found at path: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`[FileHelper] ❌ Error deleting file ${fileUrl}:`, error.message);
    console.error('[FileHelper] Error stack:', error.stack);
    return false;
  }
};

/**
 * Xóa nhiều file upload cùng lúc
 * @param {string[]} fileUrls - Mảng các URL file cần xóa
 * @returns {number} - Số lượng file đã xóa thành công
 */
export const deleteMultipleFiles = (fileUrls) => {
  if (!Array.isArray(fileUrls)) {
    return 0;
  }

  let deletedCount = 0;
  for (const url of fileUrls) {
    if (deleteUploadedFile(url)) {
      deletedCount++;
    }
  }

  return deletedCount;
};

/**
 * Xóa file cũ khi update field mới (nếu file cũ khác file mới)
 * @param {string} oldUrl - URL file cũ
 * @param {string} newUrl - URL file mới
 */
export const deleteOldFileOnUpdate = (oldUrl, newUrl) => {
  console.log('[FileHelper] deleteOldFileOnUpdate called');
  console.log('[FileHelper] oldUrl:', oldUrl);
  console.log('[FileHelper] newUrl:', newUrl);
  
  // Không xóa nếu oldUrl không tồn tại
  if (!oldUrl) {
    console.log('[FileHelper] No oldUrl, skipping');
    return false;
  }

  // Không xóa nếu oldUrl giống newUrl (không có thay đổi)
  if (oldUrl === newUrl) {
    console.log('[FileHelper] oldUrl === newUrl, no change, skipping');
    return false;
  }

  // Xử lý cả full URL và relative path
  let pathToCheck = oldUrl;
  
  // Nếu là full URL, extract path
  if (oldUrl.startsWith('http://') || oldUrl.startsWith('https://')) {
    try {
      const urlObj = new URL(oldUrl);
      pathToCheck = urlObj.pathname;
      console.log('[FileHelper] Extracted path from oldUrl:', pathToCheck);
    } catch (e) {
      console.log('[FileHelper] Invalid URL format in oldUrl, skipping');
      return false;
    }
  }
  
  // Check if it's from uploads folder
  if (!pathToCheck.startsWith('/uploads/')) {
    console.log('[FileHelper] oldUrl not from /uploads/, skipping. Path:', pathToCheck);
    return false;
  }

  console.log('[FileHelper] Calling deleteUploadedFile with:', oldUrl);
  return deleteUploadedFile(oldUrl);
};
