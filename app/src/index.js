// IMPORTANT: The OpenTelemetry SDK must be initialized before any other
// module (especially `express` and `http`) is required, so that
// auto-instrumentation can correctly patch those modules.
require('./tracing/tracing');

/* eslint-disable global-require */
const app = require('./app');
const logger = require('./logging/logger');
/* eslint-enable global-require */

const PORT = parseInt(process.env.PORT || '8080', 10);

const server = app.listen(PORT, () => {
  logger.info(`ecommerce-api listening on port ${PORT}`);
});

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server.close(() => {
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
