import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS configuration: controls which origins may call the API.
 */
export const getCorsConfig = (): CorsOptions => {
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

  return {
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, Postman, mobile apps)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Allow only configured origins
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },

    // Allowed HTTP methods
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // Allowed request headers
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-ID',
    ],

    // Response headers exposed to the browser
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],

    // Allow credentials (cookies, Authorization header)
    credentials: true,

    // How long a preflight response may be cached (24 hours)
    maxAge: 86400,

    // Handle preflight requests
    preflightContinue: false,

    // Answer OPTIONS with 204
    optionsSuccessStatus: 204,
  };
};
