const Joi = require('joi');

module.exports = (schema) => (req, res, next) => {
  let validationSchema;
  let dataToValidate;

  // Check if schema has nested structure (body, params, query)
  if (schema.body) {
    validationSchema = schema.body;
    dataToValidate = req.body;
  } else if (schema.params) {
    validationSchema = schema.params;
    dataToValidate = req.params;
  } else if (schema.query) {
    validationSchema = schema.query;
    dataToValidate = req.query;
  } else {
    // Schema is a direct Joi schema
    validationSchema = schema;
    dataToValidate = req.body;
  }

  const { error, value } = validationSchema.validate(dataToValidate, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((d) => d.message),
    });
  }

  // Update the appropriate request property with validated data
  if (schema.body) {
    req.body = value;
  } else if (schema.params) {
    req.params = value;
  } else if (schema.query) {
    req.query = value;
  } else {
    req.body = value;
  }

  return next();
};
