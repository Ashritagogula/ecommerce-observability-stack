/**
 * OpenTelemetry SDK bootstrap.
 *
 * CRITICAL: this module must be `require`-d before ANY other application
 * module (including `express`) is imported. Auto-instrumentation works by
 * monkey-patching the `require` cache for supported libraries (http,
 * express, etc). If those libraries are already loaded by the time the SDK
 * registers its instrumentations, the patches will not take effect and
 * spans will not be generated for them. See src/index.js.
 */
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ecommerce-api';

// Probabilistic sampling: sample a fraction of root traces to avoid
// overwhelming the tracing backend / network under high production traffic.
// ParentBasedSampler ensures that once a trace IS sampled (e.g. because an
// upstream caller decided to sample it), all downstream spans in that trace
// are kept for a complete, non-fragmented picture.
const SAMPLING_RATIO = parseFloat(process.env.OTEL_SAMPLING_RATIO || '0.15');

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://jaeger:4318/v1/traces',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  }),
  traceExporter,
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(SAMPLING_RATIO),
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Reduce noise: filesystem instrumentation is extremely chatty and
      // rarely useful for tracing an HTTP API's request lifecycle.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

try {
  sdk.start();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      log_level: 'info',
      message: `OpenTelemetry SDK started (service=${SERVICE_NAME}, sampling_ratio=${SAMPLING_RATIO})`,
      service_name: SERVICE_NAME,
      correlation_id: 'startup',
      trace_id: '0'.repeat(32),
      span_id: '0'.repeat(16),
    })
  );
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      log_level: 'error',
      message: `Failed to start OpenTelemetry SDK: ${err.message}`,
      service_name: SERVICE_NAME,
      correlation_id: 'startup',
      trace_id: '0'.repeat(32),
      span_id: '0'.repeat(16),
    })
  );
}

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .catch(() => {})
    .finally(() => process.exit(0));
});

module.exports = sdk;
