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
  // Authentication: slows down credential stuffing and mass sign-ups.
  // Sign-in is not here: LoginAttemptsService counts only failed attempts,
  // which a request-counting throttler cannot express.
  auth: {
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

/**
 * Builds a @Throttle() override for the named throttlers above.
 *
 * The module declares `short`, `medium` and `long`; an override keyed
 * `default` is silently ignored, so every name has to be replaced for a
 * stricter limit to take effect.
 */
export const strictThrottle = (rule: { ttl: number; limit: number }) => ({
  short: rule,
  medium: rule,
  long: rule,
});
