const express = require('express');

const correlationMiddleware = require('./middleware/correlation');
const metricsMiddleware = require('./middleware/metricsMiddleware');
const orderRoutes = require('./routes/orderRoutes');
const { register } = require('./metrics/metrics');
const logger = require('./logging/logger');

const app = express();

app.disable('x-powered-by');
app.use(express.json());

// Establish correlation_id context for every request FIRST, so downstream
// middleware/logging/handlers can rely on it being present.
app.use(correlationMiddleware);
app.use(metricsMiddleware);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: process.env.SERVICE_NAME || 'ecommerce-api' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.use('/', orderRoutes);

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error(`Failed to serialize metrics: ${err.message}`);
    res.status(500).end();
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
