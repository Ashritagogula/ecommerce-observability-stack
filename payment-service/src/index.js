/**
 * Mock external payment gateway.
 *
 * Stands in for a third-party payment API (e.g. Stripe). Introduces
 * artificial network latency (>= 100ms, per task requirements) and a
 * configurable random failure rate so the primary API's
 * `payment_failures_total` metric has real data to report.
 */
const express = require('express');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '9000', 10);
const FAILURE_RATE = parseFloat(process.env.PAYMENT_FAILURE_RATE || '0.1');
const MIN_LATENCY_MS = 100;
const MAX_EXTRA_LATENCY_MS = 300;

function log(level, message) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      log_level: level,
      message,
      service_name: 'payment-mock-service',
    })
  );
}

app.post('/charge', async (req, res) => {
  const { orderId, amount } = req.body || {};
  const delayMs = MIN_LATENCY_MS + Math.random() * MAX_EXTRA_LATENCY_MS;

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (Math.random() < FAILURE_RATE) {
    log('warn', `Declining payment for order ${orderId} (amount=${amount})`);
    return res.status(502).json({ error: 'Payment declined by issuing bank' });
  }

  log('info', `Approving payment for order ${orderId} (amount=${amount})`);
  return res.status(200).json({
    status: 'approved',
    reference: `pay_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
  });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'healthy' }));

app.listen(PORT, () => {
  log('info', `payment-mock-service listening on port ${PORT}`);
});
