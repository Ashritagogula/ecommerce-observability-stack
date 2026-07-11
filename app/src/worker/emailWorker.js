/**
 * Background Worker (Async Job).
 *
 * Simulates dispatching a "send confirmation email" job that executes
 * independently of the originating HTTP response lifecycle. In a real
 * production system this would be backed by a durable queue (SQS, Kafka,
 * BullMQ, etc); here an in-memory `setImmediate` deferred execution loop is
 * sufficient to demonstrate the required decoupling.
 *
 * Because the job crosses an asynchronous execution boundary, it CANNOT
 * rely on the AsyncLocalStorage context that was active in the original
 * request (that context is scoped to the call stack that created it and
 * will not survive into a `setImmediate` callback body execution once the
 * enclosing HTTP request has already been handled). We therefore explicitly
 * capture the correlation_id into the job payload up-front, and re-inject
 * it into a *brand new* AsyncLocalStorage context when the job begins
 * execution, so that every log line the worker emits still carries the
 * original request's correlation_id.
 */
const { trace, context } = require('@opentelemetry/api');
const logger = require('../logging/logger');
const { asyncLocalStorage } = require('../context/store');

const tracer = trace.getTracer('ecommerce-worker');

const EMAIL_SEND_LATENCY_MS = 75;

/**
 * @param {{correlation_id: string, orderId: string}} payload
 */
function dispatchConfirmationEmail(payload) {
  const { correlation_id: correlationId, orderId } = payload;

  // Capture the currently active trace context so the async work, even
  // though it runs on a later tick, can still be linked as part of the
  // same trace in Jaeger.
  const parentOtelContext = context.active();

  logger.info(`Dispatched background job: send confirmation email for order ${orderId}`, {
    'order.id': orderId,
  });

  // Decoupled from the HTTP response lifecycle: the caller does not await
  // this function's internal work, only the act of scheduling it.
  setImmediate(() => {
    const store = new Map();
    store.set('correlation_id', correlationId);

    asyncLocalStorage.run(store, () => {
      context.with(parentOtelContext, () => {
        tracer.startActiveSpan('Worker.SendConfirmationEmail', async (span) => {
          try {
            span.setAttribute('order.id', orderId);
            span.setAttribute('job.type', 'send_confirmation_email');

            logger.info(`Sending confirmation email for order ${orderId}`, { 'order.id': orderId });

            await new Promise((resolve) => setTimeout(resolve, EMAIL_SEND_LATENCY_MS));

            logger.info(`Confirmation email sent for order ${orderId}`, { 'order.id': orderId });
          } catch (err) {
            span.recordException(err);
            logger.error(`Failed to send confirmation email for order ${orderId}: ${err.message}`, {
              'order.id': orderId,
            });
          } finally {
            span.end();
          }
        });
      });
    });
  });
}

module.exports = { dispatchConfirmationEmail };
