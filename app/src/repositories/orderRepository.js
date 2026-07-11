/**
 * Data Access / Repository Layer.
 *
 * Simulates a database using an in-memory Map plus an artificial delay to
 * stand in for real network/disk I/O latency, which is enough to produce a
 * meaningful, non-instantaneous span in the trace tree.
 */
const { trace } = require('@opentelemetry/api');
const logger = require('../logging/logger');

const tracer = trace.getTracer('ecommerce-repository');

const DB_LATENCY_MS = 50;

const orders = new Map();

function saveOrder(order) {
  return tracer.startActiveSpan('Repository.SaveOrder', async (span) => {
    try {
      span.setAttribute('order.id', order.id);
      span.setAttribute('db.operation', 'INSERT');
      span.setAttribute('db.system', 'in-memory');

      // Simulate real database write latency.
      await new Promise((resolve) => setTimeout(resolve, DB_LATENCY_MS));

      orders.set(order.id, { ...order });
      logger.debug(`Order ${order.id} persisted to in-memory store`, { 'order.id': order.id });

      return order;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

function getOrder(id) {
  return tracer.startActiveSpan('Repository.GetOrder', (span) => {
    try {
      span.setAttribute('order.id', id);
      const found = orders.get(id);
      return found ? { ...found } : undefined;
    } finally {
      span.end();
    }
  });
}

function updateOrder(id, patch) {
  return tracer.startActiveSpan('Repository.UpdateOrder', (span) => {
    try {
      span.setAttribute('order.id', id);
      const existing = orders.get(id);
      if (!existing) {
        return undefined;
      }
      const updated = { ...existing, ...patch };
      orders.set(id, updated);
      return { ...updated };
    } finally {
      span.end();
    }
  });
}

module.exports = { saveOrder, getOrder, updateOrder };
