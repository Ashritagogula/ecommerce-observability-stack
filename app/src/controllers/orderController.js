/**
 * API Gateway / Controller Layer.
 *
 * Handles HTTP concerns only: request validation and response formatting.
 * All business logic lives in the Service layer.
 */
const orderService = require('../services/orderService');
const logger = require('../logging/logger');

async function createOrderHandler(req, res) {
  const { item, quantity, amount } = req.body || {};

  if (!item || typeof item !== 'string') {
    return res.status(400).json({ error: 'Field "item" (string) is required' });
  }
  if (amount === undefined || amount === null || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Field "amount" (positive number) is required' });
  }
  if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0)) {
    return res.status(400).json({ error: 'Field "quantity", if provided, must be a positive number' });
  }

  try {
    const order = await orderService.createOrder({ item, quantity, amount });
    return res.status(201).json(order);
  } catch (err) {
    if (err instanceof orderService.PaymentDeclinedError) {
      return res.status(402).json({ error: 'Payment declined', details: err.message });
    }
    logger.error(`Failed to create order: ${err.message}`);
    return res.status(502).json({ error: 'Failed to process order', details: err.message });
  }
}

function getOrderHandler(req, res) {
  const order = orderService.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  return res.status(200).json(order);
}

module.exports = { createOrderHandler, getOrderHandler };
