const Joi = require('joi');

exports.createSampleSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
});
