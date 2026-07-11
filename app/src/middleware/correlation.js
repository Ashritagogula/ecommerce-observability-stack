const { v4: uuidv4 } = require('uuid');
const { asyncLocalStorage } = require('../context/store');
const logger = require('../logging/logger');

/**
 * Establishes a per-request AsyncLocalStorage context carrying the
 * correlation_id. If the caller already supplied one (e.g. an upstream
 * gateway), we honor it so that correlation IDs remain stable across
 * service boundaries; otherwise we mint a new UUID.
 */
function correlationMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();

  const store = new Map();
  store.set('correlation_id', correlationId);

  res.setHeader('x-correlation-id', correlationId);

  asyncLocalStorage.run(store, () => {
    logger.info(`Incoming request ${req.method} ${req.originalUrl}`);
    next();
  });
}

module.exports = correlationMiddleware;
