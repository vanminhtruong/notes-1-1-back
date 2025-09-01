const router = require('express').Router();
const controller = require('../../controllers/sample.controller');
const validate = require('../../middlewares/validate');
const { createSampleSchema } = require('../../validators/sample.validator');

router.get('/', controller.list);
router.post('/', validate(createSampleSchema), controller.create);

module.exports = router;
