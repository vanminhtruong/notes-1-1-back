const Joi = require('joi');

const validateCreateNote = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().min(1).max(200).required().messages({
      'string.min': 'Tiêu đề không được để trống',
      'string.max': 'Tiêu đề không được quá 200 ký tự',
      'any.required': 'Tiêu đề là bắt buộc',
    }),
    content: Joi.string().allow('').optional(),
    category: Joi.string().max(50).optional().default('general'),
    priority: Joi.string().valid('low', 'medium', 'high').optional().default('medium').messages({
      'any.only': 'Mức độ ưu tiên phải là low, medium hoặc high',
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
    category: Joi.string().max(50).optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional().messages({
      'any.only': 'Mức độ ưu tiên phải là low, medium hoặc high',
    }),
    isArchived: Joi.boolean().optional(),
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

module.exports = {
  validateCreateNote,
  validateUpdateNote,
};
