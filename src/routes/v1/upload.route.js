import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import authenticate from '../../middlewares/auth.js';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Separate uploader for generic files (allow any mimetype), larger size limit
const uploadAny = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// POST /api/v1/uploads/image
router.post('/image', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const publicUrl = `/uploads/${req.file.filename}`; // Served by express.static('public')
    return res.status(201).json({ success: true, data: { url: publicUrl, filename: req.file.filename } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// POST /api/v1/uploads/file
router.post('/file', uploadAny.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const publicUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({ success: true, data: { url: publicUrl, filename: req.file.filename } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

export default router;
