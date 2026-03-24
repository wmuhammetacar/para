function durationInMs(startAt) {
  const diff = process.hrtime.bigint() - startAt;
  return Number(diff) / 1e6;
}

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test' || req.path === '/health') {
      return;
    }

    const payload = {
      time: new Date().toISOString(),
      requestId: req.requestId || null,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationInMs(startedAt).toFixed(2))
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  });

  next();
}
