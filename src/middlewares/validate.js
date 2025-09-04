const Joi = require('joi');

// This middleware now supports validating multiple parts of the request
// simultaneously (e.g. { params, body, query }). It will validate each
// provided part independently and write the sanitized values back onto req.
module.exports = (schema) => (req, res, next) => {
  const details = [];

  const validatePart = (partName, value, joiSchema) => {
    const { error, value: validated } = joiSchema.validate(value, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      details.push(
        ...error.details.map((d) => `${partName}: ${d.message}`)
      );
      return null;
    }
    return validated;
  };

  // If schema is a raw Joi schema, treat it as body-only for backward compat
  if (!schema.body && !schema.params && !schema.query) {
    const validated = validatePart('body', req.body, schema);
    if (details.length) {
      return res.status(400).json({ message: 'Validation error', details });
    }
    req.body = validated;
    return next();
  }

  // Validate present parts
  if (schema.params) {
    const validated = validatePart('params', req.params, schema.params);
    if (validated) req.params = validated;
  }
  if (schema.query) {
    const validated = validatePart('query', req.query, schema.query);
    if (validated) req.query = validated;
  }
  if (schema.body) {
    const validated = validatePart('body', req.body, schema.body);
    if (validated) req.body = validated;
  }

  if (details.length) {
    return res.status(400).json({ message: 'Validation error', details });
  }

  return next();
};
