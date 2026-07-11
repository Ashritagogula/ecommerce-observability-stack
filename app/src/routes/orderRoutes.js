const express = require('express');
const { createOrderHandler, getOrderHandler } = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', createOrderHandler);
router.get('/orders/:id', getOrderHandler);

module.exports = router;
