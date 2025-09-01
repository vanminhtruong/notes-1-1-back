const Joi = require('joi');

const validateRegister = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email không hợp lệ',
      'any.required': 'Email là bắt buộc',
    }),
    password: Joi.string().min(6).max(100).required().messages({
      'string.min': 'Mật khẩu phải có ít nhất 6 ký tự',
      'string.max': 'Mật khẩu không được quá 100 ký tự',
      'any.required': 'Mật khẩu là bắt buộc',
    }),
    name: Joi.string().min(2).max(50).required().messages({
      'string.min': 'Tên phải có ít nhất 2 ký tự',
      'string.max': 'Tên không được quá 50 ký tự',
      'any.required': 'Tên là bắt buộc',
    }),
    phone: Joi.string().pattern(/^[+[0-9]][0-9\s\-()]{5,20}$/).allow(null, '').messages({
      'string.pattern.base': 'Số điện thoại không hợp lệ',
    }),
    birthDate: Joi.date().iso().allow(null).messages({
      'date.format': 'Ngày sinh không hợp lệ',
    }),
    gender: Joi.string().valid('male', 'female', 'other', 'unspecified').optional(),
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

const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email không hợp lệ',
      'any.required': 'Email là bắt buộc',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Mật khẩu là bắt buộc',
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

const validateChangePassword = (req, res, next) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Mật khẩu hiện tại là bắt buộc',
    }),
    newPassword: Joi.string().min(6).max(100).required().messages({
      'string.min': 'Mật khẩu mới phải có ít nhất 6 ký tự',
      'string.max': 'Mật khẩu mới không được quá 100 ký tự',
      'any.required': 'Mật khẩu mới là bắt buộc',
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

const validateForgotPasswordRequest = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email không hợp lệ',
      'any.required': 'Email là bắt buộc',
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

const validateVerifyOtp = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email không hợp lệ',
      'any.required': 'Email là bắt buộc',
    }),
    otp: Joi.string().pattern(/^\d{6}$/).required().messages({
      'string.pattern.base': 'OTP phải gồm 6 chữ số',
      'any.required': 'OTP là bắt buộc',
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

const validateResetPassword = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email không hợp lệ',
      'any.required': 'Email là bắt buộc',
    }),
    otp: Joi.string().pattern(/^\d{6}$/).required().messages({
      'string.pattern.base': 'OTP phải gồm 6 chữ số',
      'any.required': 'OTP là bắt buộc',
    }),
    newPassword: Joi.string().min(6).max(100).required().messages({
      'string.min': 'Mật khẩu mới phải có ít nhất 6 ký tự',
      'string.max': 'Mật khẩu mới không được quá 100 ký tự',
      'any.required': 'Mật khẩu mới là bắt buộc',
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

// Validate updating profile fields
const validateUpdateProfile = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(50).optional().messages({
      'string.min': 'Tên phải có ít nhất 2 ký tự',
      'string.max': 'Tên không được quá 50 ký tự',
    }),
    avatar: Joi.string().uri().allow('', null).optional(),
    phone: Joi.string().pattern(/^[+\d][\d\s\-()]{5,20}$/).allow(null, '').optional().messages({
      'string.pattern.base': 'Số điện thoại không hợp lệ',
    }),
    birthDate: Joi.date().iso().allow(null).optional().messages({
      'date.format': 'Ngày sinh không hợp lệ',
    }),
    gender: Joi.string().valid('male', 'female', 'other', 'unspecified').optional(),
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
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateForgotPasswordRequest,
  validateVerifyOtp,
  validateResetPassword,
  validateUpdateProfile,
};

