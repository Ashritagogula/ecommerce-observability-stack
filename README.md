# E-Commerce Orders API — Full Observability Stack

A fully instrumented REST API (Node.js/Express) demonstrating production-grade
observability using **structured logging**, **OpenTelemetry distributed
tracing**, and **Prometheus metrics**, visualized through **Grafana**
dashboards with **Jaeger** trace correlation.

## Architecture

```
project-root/
├── app/                       # Main ecommerce-api service
│   ├── src/
│   │   ├── controllers/       # HTTP routing / validation / responses
│   │   ├── services/          # Business logic (order creation, payment)
│   │   ├── repositories/      # In-memory "database" layer
│   │   ├── worker/            # Async background job (confirmation email)
│   │   ├── middleware/        # Correlation ID + metrics middleware
│   │   ├── logging/           # Structured JSON logger
│   │   ├── metrics/           # Prometheus metric definitions
│   │   ├── tracing/           # OpenTelemetry SDK bootstrap
│   │   ├── context/           # AsyncLocalStorage context store
│   │   ├── routes/
│   │   ├── app.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── payment-service/           # Mock external payment gateway (simulates 3rd-party API)
├── observability/
│   ├── prometheus.yml
│   └── grafana/
│       ├── provisioning/datasources/datasource.yml
│       ├── provisioning/dashboards/dashboard.yml
│       ├── service-health-dashboard.json
│       └── business-kpi-dashboard.json
├── tests/
│   ├── verify_stack.sh        # Automated verification (required by evaluators)
│   └── load_test.sh           # Optional local load generator
├── docker-compose.yml
├── .env.example
├── submission.json
└── README.md
```

## Request Flow

```
Client
  └─ POST /orders
       └─ Controller (validation)
            └─ Service.CreateOrder            [span]
                 ├─ Repository.SaveOrder       [span, ~50ms simulated DB write]
                 ├─ HTTP POST → payment-mock   [span, W3C traceparent injected, 100-400ms]
                 └─ Worker.SendConfirmationEmail (dispatched, NOT awaited by the
                                                  HTTP response — decoupled async job)
```

Every log line emitted across all of these layers — including inside the
background worker — carries the **same `correlation_id`** and (when sampled)
the **same `trace_id`**, with unique `span_id`s per operation.

## Quick Start

```bash
cp .env.example .env    # optional, defaults already work inside Docker Compose
docker compose up --build
```

This brings up:

| Service      | URL                              | Purpose                         |
|--------------|-----------------------------------|----------------------------------|
| `api`        | http://localhost:8080            | The instrumented Orders API      |
| `payment`    | (internal only, `payment:9000`)  | Mock external payment gateway    |
| `prometheus` | http://localhost:9090            | Metrics scraping & querying      |
| `jaeger`     | http://localhost:16686           | Distributed trace viewer         |
| `grafana`    | http://localhost:3000            | Dashboards (anonymous admin access) |

## API Endpoints

- `GET /` — basic health/status check (200 OK)
- `GET /health` — health probe
- `POST /orders` — create an order
  ```bash
  curl -X POST http://localhost:8080/orders \
    -H "Content-Type: application/json" \
    -d '{"item": "Wireless Mouse", "quantity": 1, "amount": 29.99}'
  ```
- `GET /orders/:id` — fetch an order by id
- `GET /metrics` — Prometheus exposition-format metrics

## Generating Traffic

```bash
bash tests/load_test.sh 120 10   # 120 seconds at ~10 req/s
```

Then explore:
- **Jaeger UI** (`localhost:16686`) → select service `ecommerce-api` → find traces
  spanning Controller → Service → Repository → external `payment` call.
- **Prometheus** (`localhost:9090`) → query `http_requests_total`,
  `orders_created_total`, `payment_failures_total`.
- **Grafana** (`localhost:3000`) → pre-provisioned dashboards:
  - *E-Commerce API - Service Health (Golden Signals)*
  - *E-Commerce API - Business KPIs*

## Structured Logging

Every log line is a single-line JSON object with exactly these fields:

```json
{
  "timestamp": "2026-07-11T06:00:00.000Z",
  "log_level": "info",
  "message": "Order 3f2a... created and paid successfully",
  "service_name": "ecommerce-api",
  "correlation_id": "b6e2b1b2-...",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7"
}
```

## Tracing

- SDK: `@opentelemetry/sdk-node` with auto-instrumentation for HTTP/Express
  plus manual spans (`Service.CreateOrder`, `Repository.SaveOrder`,
  `Worker.SendConfirmationEmail`) for business-level operations.
- Exporter: OTLP/HTTP → `http://jaeger:4318/v1/traces`.
- Sampling: `ParentBasedSampler` wrapping a `TraceIdRatioBasedSampler` at
  **0.15** (15%), configurable via `OTEL_SAMPLING_RATIO`.
- Outbound calls to the mock payment service automatically carry the W3C
  `traceparent` header via HTTP auto-instrumentation.

## Metrics

Exposed at `GET /metrics` in Prometheus exposition format:

- `http_requests_total{method,route,status_code}` (Counter)
- `http_request_duration_seconds{method,route,status_code}` (Histogram,
  buckets: `[0.01, 0.05, 0.1, 0.5, 1, 5]`)
- `http_errors_total{method,route,status_code}` (Counter, 5xx only)
- `orders_created_total` (Counter, business metric)
- `payment_failures_total` (Counter, business metric)
- Default Node.js process/runtime metrics (event loop, memory, GC)

## Verification

```bash
docker compose up --build -d
# wait for services to become healthy, then:
bash tests/verify_stack.sh
```

Exits `0` on success, `1` if any check fails. This is also what
`submission.json` wires up as the automated test command.

## Notes on Design Decisions

- **In-memory repository**: per task scope, no real database is required;
  a `Map` plus an artificial 50ms delay stands in for real I/O latency.
- **Mock payment gateway as its own container** rather than a public URL
  (e.g. httpbin.org): keeps the demo fully reproducible offline / inside CI,
  while still exercising a genuine outbound HTTP call with W3C trace
  propagation and configurable failure injection for `payment_failures_total`.
- **Background job** uses `setImmediate` plus a freshly re-established
  `AsyncLocalStorage` context seeded from the job payload's
  `correlation_id` — this is the correct pattern once you cross an
  asynchronous/queue boundary, since the original request's context does
  not survive into a later event-loop tick or separate process.
