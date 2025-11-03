import Joi from 'joi';

const validateCreateBackground = (req, res, next) => {
  const schema = Joi.object({
    uniqueId: Joi.string().min(1).max(50).required().messages({
      'string.min': 'UniqueId không được để trống',
      'string.max': 'UniqueId không được quá 50 ký tự',
      'any.required': 'UniqueId là bắt buộc',
    }),
    type: Joi.string().valid('color', 'image').required().messages({
      'any.only': 'Type phải là color hoặc image',
      'any.required': 'Type là bắt buộc',
    }),
    value: Joi.string().max(500).allow(null, '').optional().messages({
      'string.max': 'Value không được quá 500 ký tự',
    }),
    label: Joi.string().min(1).max(100).required().messages({
      'string.min': 'Label không được để trống',
      'string.max': 'Label không được quá 100 ký tự',
      'any.required': 'Label là bắt buộc',
    }),
    category: Joi.string().max(50).optional().default('basic').messages({
      'string.max': 'Category không được quá 50 ký tự',
    }),
    sortOrder: Joi.number().integer().min(0).optional().default(0).messages({
      'number.base': 'SortOrder phải là số',
      'number.integer': 'SortOrder phải là số nguyên',
      'number.min': 'SortOrder phải >= 0',
    }),
    isActive: Joi.boolean().optional().default(true),
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

const validateUpdateBackground = (req, res, next) => {
  const schema = Joi.object({
    uniqueId: Joi.string().min(1).max(50).optional().messages({
      'string.min': 'UniqueId không được để trống',
      'string.max': 'UniqueId không được quá 50 ký tự',
    }),
    type: Joi.string().valid('color', 'image').optional().messages({
      'any.only': 'Type phải là color hoặc image',
    }),
    value: Joi.string().max(500).allow(null, '').optional().messages({
      'string.max': 'Value không được quá 500 ký tự',
    }),
    label: Joi.string().min(1).max(100).optional().messages({
      'string.min': 'Label không được để trống',
      'string.max': 'Label không được quá 100 ký tự',
    }),
    category: Joi.string().max(50).optional().messages({
      'string.max': 'Category không được quá 50 ký tự',
    }),
    sortOrder: Joi.number().integer().min(0).optional().messages({
      'number.base': 'SortOrder phải là số',
      'number.integer': 'SortOrder phải là số nguyên',
      'number.min': 'SortOrder phải >= 0',
    }),
    isActive: Joi.boolean().optional(),
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

export { validateCreateBackground, validateUpdateBackground };
