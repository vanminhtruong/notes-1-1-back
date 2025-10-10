import Joi from 'joi';

const validateCreateNote = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().min(1).max(200).required().messages({
      'string.min': 'Tiêu đề không được để trống',
      'string.max': 'Tiêu đề không được quá 200 ký tự',
      'any.required': 'Tiêu đề là bắt buộc',
    }),
    content: Joi.string().allow('').optional(),
    imageUrl: Joi.string().uri().allow(null, '').optional(),
    videoUrl: Joi.string().uri().allow(null, '').optional(),
    youtubeUrl: Joi.string().uri().allow(null, '').optional(),
    categoryId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'ID danh mục phải là số',
      'number.positive': 'ID danh mục phải là số dương',
    }),
    priority: Joi.string().valid('low', 'medium', 'high').optional().default('medium').messages({
      'any.only': 'Mức độ ưu tiên phải là low, medium hoặc high',
    }),
    reminderAt: Joi.alternatives().try(
      Joi.date().iso(),
      Joi.string().isoDate()
    ).allow(null).optional(),
    sharedFromUserId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'Shared From User ID phải là số',
      'number.positive': 'Shared From User ID phải là số dương',
    }),
    folderId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'ID thư mục phải là số',
      'number.positive': 'ID thư mục phải là số dương',
    }),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateUpdateNote = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().min(1).max(200).optional().messages({
      'string.min': 'Tiêu đề không được để trống',
      'string.max': 'Tiêu đề không được quá 200 ký tự',
    }),
    content: Joi.string().allow('').optional(),
    imageUrl: Joi.string().uri().allow(null, '').optional(),
    videoUrl: Joi.string().uri().allow(null, '').optional(),
    youtubeUrl: Joi.string().uri().allow(null, '').optional(),
    categoryId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'ID danh mục phải là số',
      'number.positive': 'ID danh mục phải là số dương',
    }),
    priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
      'any.only': 'Mức độ ưu tiên phải là low, medium hoặc high',
    }),
    isArchived: Joi.boolean().optional(),
    reminderAt: Joi.alternatives().try(
      Joi.date().iso(),
      Joi.string().isoDate()
    ).allow(null).optional(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateShareNote = (req, res, next) => {
  const schema = Joi.object({
    userId: Joi.number().integer().positive().required().messages({
      'number.base': 'ID người dùng phải là số',
      'number.positive': 'ID người dùng phải là số dương',
      'any.required': 'ID người dùng là bắt buộc',
    }),
    canEdit: Joi.boolean().optional().default(false),
    canDelete: Joi.boolean().optional().default(false),
    canCreate: Joi.boolean().optional().default(false),
    message: Joi.string().max(500).allow('').optional().messages({
      'string.max': 'Tin nhắn không được quá 500 ký tự',
    }),
    messageId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'Message ID phải là số',
      'number.positive': 'Message ID phải là số dương',
    }),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateShareNoteToGroup = (req, res, next) => {
  const schema = Joi.object({
    groupId: Joi.number().integer().positive().required().messages({
      'number.base': 'ID nhóm phải là số',
      'number.positive': 'ID nhóm phải là số dương',
      'any.required': 'ID nhóm là bắt buộc',
    }),
    message: Joi.string().max(500).allow('').optional().messages({
      'string.max': 'Tin nhắn không được quá 500 ký tự',
    }),
    groupMessageId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'Group Message ID phải là số',
      'number.positive': 'Group Message ID phải là số dương',
    }),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateCreateFolder = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required().messages({
      'string.min': 'Tên thư mục không được để trống',
      'string.max': 'Tên thư mục không được quá 100 ký tự',
      'any.required': 'Tên thư mục là bắt buộc',
    }),
    color: Joi.string().max(20).optional().default('blue'),
    icon: Joi.string().max(50).optional().default('folder'),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateUpdateFolder = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).optional().messages({
      'string.min': 'Tên thư mục không được để trống',
      'string.max': 'Tên thư mục không được quá 100 ký tự',
    }),
    color: Joi.string().max(20).optional(),
    icon: Joi.string().max(50).optional(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateMoveNoteToFolder = (req, res, next) => {
  const schema = Joi.object({
    folderId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'ID thư mục phải là số',
      'number.positive': 'ID thư mục phải là số dương',
    }),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateCreateCategory = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required().messages({
      'string.min': 'Tên danh mục không được để trống',
      'string.max': 'Tên danh mục không được quá 100 ký tự',
      'any.required': 'Tên danh mục là bắt buộc',
    }),
    color: Joi.string().max(20).optional().default('#3B82F6'),
    icon: Joi.string().max(50).optional().default('Tag'),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

const validateUpdateCategory = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).optional().messages({
      'string.min': 'Tên danh mục không được để trống',
      'string.max': 'Tên danh mục không được quá 100 ký tự',
    }),
    color: Joi.string().max(20).optional(),
    icon: Joi.string().max(50).optional(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      message: 'Dữ liệu không hợp lệ',
      errors: error.details.map(detail => detail.message),
    });
  }
  next();
};

export {
  validateCreateNote,
  validateUpdateNote,
  validateShareNote,
  validateShareNoteToGroup,
  validateCreateFolder,
  validateUpdateFolder,
  validateMoveNoteToFolder,
  validateCreateCategory,
  validateUpdateCategory,
};
