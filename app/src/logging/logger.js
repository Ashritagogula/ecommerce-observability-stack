/**
 * Structured JSON logger.
 *
 * Every log line emitted to stdout is a single JSON object containing
 * exactly the fields required for correlation across the three pillars of
 * observability:
 *   - correlation_id : ties together every log line for one logical request
 *                       (HTTP request -> service -> repository -> worker)
 *   - trace_id/span_id: ties a log line to the exact OpenTelemetry span that
 *                       was active when it was emitted, enabling
 *                       log <-> trace pivoting in Grafana/Jaeger.
 */
const { trace, context } = require('@opentelemetry/api');
const { asyncLocalStorage } = require('../context/store');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ecommerce-api';

const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);

function currentTraceContext() {
  const span = trace.getSpan(context.active());
  if (span) {
    const spanContext = span.spanContext();
    if (spanContext && spanContext.traceId) {
      return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
    }
  }
  return { trace_id: ZERO_TRACE_ID, span_id: ZERO_SPAN_ID };
}

function currentCorrelationId() {
  const store = asyncLocalStorage.getStore();
  return (store && store.get('correlation_id')) || 'unknown';
}

/**
 * Emits a single structured JSON log line to stdout.
 *
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [extra] additional structured fields (must not collide
 *   with the reserved schema keys below)
 */
function emit(level, message, extra = {}) {
  const { trace_id, span_id } = currentTraceContext();

  const entry = {
    timestamp: new Date().toISOString(),
    log_level: level,
    message,
    service_name: SERVICE_NAME,
    correlation_id: currentCorrelationId(),
    trace_id,
    span_id,
  };

  // Merge additional context (e.g. order.id) without allowing callers to
  // accidentally clobber the required schema fields above.
  for (const [key, value] of Object.entries(extra)) {
    if (!(key in entry)) {
      entry[key] = value;
    }
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

module.exports = {
  debug: (message, extra) => emit('debug', message, extra),
  info: (message, extra) => emit('info', message, extra),
  warn: (message, extra) => emit('warn', message, extra),
  error: (message, extra) => emit('error', message, extra),
};
