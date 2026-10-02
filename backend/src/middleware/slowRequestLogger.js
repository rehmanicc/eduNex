const DEFAULT_THRESHOLD_MS = 500;

module.exports = function slowRequestLogger(req, res, next) {
  const configured = Number(process.env.SLOW_REQUEST_MS);
  const thresholdMs = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_THRESHOLD_MS;
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (elapsedMs < thresholdMs) return;
    const requestId = req.id || req.requestId || res.getHeader('X-Request-Id') || '-';
    console.warn(`[SLOW_API] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms requestId=${requestId}`);
  });

  next();
};
