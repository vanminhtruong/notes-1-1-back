const router = require('express').Router();
const pkg = require('../../package.json');
const v1 = require('./v1');

router.get('/health', (req, res) => {
  res.json({ status: 'ok', name: pkg.name, version: pkg.version, time: new Date().toISOString() });
});

router.use('/v1', v1);

module.exports = router;
