/**
 * Prometheus metrics registry.
 *
 * Exposes standard "Golden Signal" HTTP metrics (traffic, latency, errors)
 * as well as custom business-level metrics for the Orders domain.
 */
const client = require('prom-client');

const register = new client.Registry();

// Default Node.js process/runtime metrics (event loop lag, GC, memory, etc).
// Useful for the "Saturation" golden signal.
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received, labeled by method/route/status',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP requests that resulted in a 5xx response',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// --- Business metrics -------------------------------------------------

const ordersCreatedTotal = new client.Counter({
  name: 'orders_created_total',
  help: 'Total number of orders successfully created and paid for',
  registers: [register],
});

const paymentFailuresTotal = new client.Counter({
  name: 'payment_failures_total',
  help: 'Total number of failed calls to the external payment gateway',
  registers: [register],
});

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpErrorsTotal,
  ordersCreatedTotal,
  paymentFailuresTotal,
};
