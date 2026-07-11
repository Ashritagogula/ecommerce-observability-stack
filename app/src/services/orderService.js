/**
 * Business Logic / Service Layer.
 *
 * Orchestrates: persistence (Repository layer), an external HTTP call to a
 * mock payment gateway, and dispatch of an async background job -- all
 * wrapped in a manually-created span so the business operation shows up as
 * a first-class node in the trace tree, distinct from the auto-generated
 * HTTP server span.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { trace } = require('@opentelemetry/api');

const logger = require('../logging/logger');
const repository = require('../repositories/orderRepository');
const worker = require('../worker/emailWorker');
const { ordersCreatedTotal, paymentFailuresTotal } = require('../metrics/metrics');
const { getCorrelationId } = require('../context/store');

const tracer = trace.getTracer('ecommerce-service');

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment:9000/charge';
const PAYMENT_TIMEOUT_MS = parseInt(process.env.PAYMENT_TIMEOUT_MS || '5000', 10);

class PaymentDeclinedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentDeclinedError';
  }
}

/**
 * Calls the external (mock) payment gateway.
 *
 * NOTE: We rely on OpenTelemetry's HTTP auto-instrumentation (registered in
 * src/tracing/tracing.js) to automatically create a client span for this
 * outbound call AND to inject the W3C `traceparent` header, since `axios`
 * is built on top of Node's core `http`/`https` modules. No manual header
 * injection is required here.
 */
async function chargePayment(order) {
  try {
    const response = await axios.post(
      PAYMENT_SERVICE_URL,
      {
        orderId: order.id,
        amount: order.amount,
      },
      { timeout: PAYMENT_TIMEOUT_MS }
    );
    return response.data;
  } catch (err) {
    paymentFailuresTotal.inc();
    logger.error(`Payment failed for order ${order.id}: ${err.message}`, { 'order.id': order.id });
    throw new PaymentDeclinedError(`Payment gateway rejected order ${order.id}: ${err.message}`);
  }
}

/**
 * Creates an order end-to-end: persist -> charge payment -> dispatch async
 * confirmation email.
 *
 * @param {{item: string, quantity?: number, amount: number}} orderInput
 */
async function createOrder(orderInput) {
  return tracer.startActiveSpan('Service.CreateOrder', async (span) => {
    try {
      const order = {
        id: uuidv4(),
        item: orderInput.item,
        quantity: orderInput.quantity || 1,
        amount: orderInput.amount,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      span.setAttribute('order.id', order.id);
      span.setAttribute('order.item', order.item);
      span.setAttribute('order.amount', order.amount);

      logger.info(`Creating order ${order.id} for item "${order.item}"`, { 'order.id': order.id });

      await repository.saveOrder(order);

      const paymentResult = await chargePayment(order);

      const paidOrder = repository.updateOrder(order.id, {
        status: 'paid',
        paymentReference: paymentResult.reference,
      });

      ordersCreatedTotal.inc();
      logger.info(`Order ${order.id} created and paid successfully`, { 'order.id': order.id });

      // Dispatch the background job. We deliberately do NOT await the
      // email being sent -- only the act of scheduling it -- so that the
      // HTTP response returns as soon as the order is paid, while the job
      // itself completes independently.
      worker.dispatchConfirmationEmail({
        correlation_id: getCorrelationId(),
        orderId: order.id,
      });

      return paidOrder;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

function getOrderById(id) {
  return repository.getOrder(id);
}

module.exports = { createOrder, getOrderById, PaymentDeclinedError };
