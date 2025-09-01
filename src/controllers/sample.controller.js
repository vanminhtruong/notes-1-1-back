const asyncHandler = require('../middlewares/asyncHandler');
const { Sample } = require('../models');

exports.list = asyncHandler(async (_req, res) => {
  const items = await Sample.findAll({ order: [['id', 'ASC']] });
  res.json({ data: items });
});

exports.create = asyncHandler(async (req, res) => {
  const created = await Sample.create({ name: req.body.name });
  res.status(201).json({ data: created });
});
