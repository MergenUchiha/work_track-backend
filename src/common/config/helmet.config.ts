import { HelmetOptions } from 'helmet';

/**
 * Конфигурация Helmet для безопасности HTTP headers
 * Защищает от различных web-уязвимостей
 */
export const helmetConfig: HelmetOptions = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // HSTS (HTTP Strict Transport Security)
  hsts: {
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-XSS-Protection
  xssFilter: true,

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // IE No Open
  ieNoOpen: true,

  // Permissions Policy (Feature Policy)
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
};
