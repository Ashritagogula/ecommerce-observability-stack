/**
 * Async context storage.
 *
 * AsyncLocalStorage allows us to carry request-scoped state (currently the
 * correlation_id) through an arbitrarily deep call chain -- including across
 * Promise/async boundaries -- WITHOUT threading it manually through every
 * function signature. This keeps business logic free of cross-cutting
 * plumbing concerns.
 *
 * NOTE: AsyncLocalStorage context is lost once you cross a true async
 * boundary such as a message queue, a `setTimeout` fired after the store
 * has been torn down, or a separate process/container. For the background
 * worker in this project we explicitly re-establish a fresh store using the
 * correlation_id captured from the payload (see worker/emailWorker.js).
 */
const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Convenience getter for the correlation_id of the currently active store,
 * falling back to 'unknown' when called outside of any tracked context
 * (e.g. during process bootstrap).
 */
function getCorrelationId() {
  const store = asyncLocalStorage.getStore();
  return store ? store.get('correlation_id') : 'unknown';
}

module.exports = { asyncLocalStorage, getCorrelationId };
