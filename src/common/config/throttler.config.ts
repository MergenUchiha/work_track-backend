import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate limiting applied to every route.
 *
 * Three overlapping windows: the short one absorbs bursts, the longer ones
 * cap sustained abuse.
 */
export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'short',
      ttl: 1000, // 1 second
      limit: 10,
    },
    {
      name: 'medium',
      ttl: 60000, // 1 minute
      limit: 100,
    },
    {
      name: 'long',
      ttl: 3600000, // 1 hour
      limit: 1000,
    },
  ],
};

/** Tighter limits for endpoints that are worth attacking. */
export const RATE_LIMIT_CUSTOM = {
  // Authentication: slows down credential stuffing and mass sign-ups
  auth: {
    login: {
      ttl: 900000, // 15 minutes
      limit: 5,
    },
    register: {
      ttl: 3600000, // 1 hour
      limit: 3,
    },
    refresh: {
      ttl: 60000, // 1 minute
      limit: 10,
    },
  },

  // Destructive or expensive operations
  critical: {
    ttl: 60000, // 1 minute
    limit: 20,
  },

  // Unauthenticated endpoints
  public: {
    ttl: 60000, // 1 minute
    limit: 60,
  },
};
