const rateLimit = require('express-rate-limit');

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function corsOptions() {
  return {
    credentials: true,

    origin(origin, cb) {
      const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);

      // Allow requests without Origin header
      // e.g. curl, server-to-server, Postman
      if (!origin) {
        return cb(null, true);
      }

      // Local development
      if (
        process.env.NODE_ENV !== 'production' &&
        (
          origin === 'http://localhost:5173' ||
          origin === 'http://127.0.0.1:5173'
        )
      ) {
        return cb(null, true);
      }

      // Configured origins
      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin)
      ) {
        return cb(null, true);
      }

      console.warn('CORS blocked origin:', origin);
      console.warn('Allowed origins:', allowedOrigins);

      return cb(
        Object.assign(
          new Error('CORS origin not allowed'),
          { statusCode: 403 }
        )
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Tenant-Host'
    ]
  };
}

const apiLimiter = rateLimit({
  windowMs: Number(
    process.env.RATE_LIMIT_WINDOW_MS || 900000
  ),

  limit: Number(
    process.env.RATE_LIMIT_MAX || 500
  ),

  standardHeaders: 'draft-7',
  legacyHeaders: false,

  message: {
    error: 'Too many requests. Please try again later.'
  }
});

const authLimiter = rateLimit({
  windowMs: Number(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS || 900000
  ),

  limit: Number(
    process.env.AUTH_RATE_LIMIT_MAX || 20
  ),

  standardHeaders: 'draft-7',
  legacyHeaders: false,

  message: {
    error:
      'Too many authentication attempts. Please try again later.'
  }
});

module.exports = {
  corsOptions,
  apiLimiter,
  authLimiter
};