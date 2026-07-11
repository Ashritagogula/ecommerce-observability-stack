const {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpErrorsTotal,
} = require('../metrics/metrics');

/**
 * Records request count, latency histogram, and error count for every
 * request that flows through the API, labeled by method/route/status_code.
 *
 * Route resolution happens on `res.on('finish')` because `req.route` is
 * only populated once Express has matched the request to a route handler.
 */
function metricsMiddleware(req, res, next) {
  const stopTimer = httpRequestDurationSeconds.startTimer();

  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };

    httpRequestsTotal.inc(labels);
    stopTimer(labels);

    if (res.statusCode >= 500) {
      httpErrorsTotal.inc(labels);
    }
  });

  next();
}

module.exports = metricsMiddleware;
