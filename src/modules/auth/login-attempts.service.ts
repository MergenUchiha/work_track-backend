import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AttemptRecord {
  count: number;
  /** When the current window started, as an epoch timestamp in ms. */
  windowStartedAt: number;
}

/**
 * Counts failed sign-in attempts per (client address, account) pair.
 *
 * Unlike a throttler on the route, successful logins do not consume the
 * budget and clear it instead, so someone who types their password correctly
 * is never locked out — only sustained guessing is.
 *
 * State is in memory: it is cheap, and a restart simply forgives everyone. A
 * multi-instance deployment would need shared storage (Redis) for the limit
 * to hold across replicas.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly attempts = new Map<string, AttemptRecord>();

  private readonly maxAttempts: number;
  private readonly windowMs: number;

  /** Prevents the map from growing without bound on a busy public endpoint. */
  private readonly maxTrackedKeys = 10_000;

  constructor(configService: ConfigService) {
    this.maxAttempts = configService.get<number>('LOGIN_MAX_ATTEMPTS') ?? 5;
    this.windowMs = configService.get<number>('LOGIN_LOCKOUT_MS') ?? 15 * 60 * 1000;
  }

  /** Key that isolates one account on one address from everyone else. */
  buildKey(ip: string, email: string): string {
    return `${ip}:${email.trim().toLowerCase()}`;
  }

  /**
   * Rejects the request when too many failures were recorded for this key.
   * Called before the password is checked.
   */
  assertNotLocked(key: string): void {
    const record = this.attempts.get(key);
    if (!record) return;

    if (this.isExpired(record)) {
      this.attempts.delete(key);
      return;
    }

    if (record.count >= this.maxAttempts) {
      const retryAfterMs = record.windowStartedAt + this.windowMs - Date.now();
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Too many failed sign-in attempts. Try again in ${retryAfterSeconds} seconds.`,
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Records one failed attempt, starting a new window when needed. */
  recordFailure(key: string): void {
    const record = this.attempts.get(key);

    if (!record || this.isExpired(record)) {
      this.evictIfCrowded();
      this.attempts.set(key, { count: 1, windowStartedAt: Date.now() });
      return;
    }

    record.count += 1;
  }

  /** Clears the budget after a successful sign-in. */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  private isExpired(record: AttemptRecord): boolean {
    return Date.now() - record.windowStartedAt >= this.windowMs;
  }

  /**
   * Drops expired records once the map gets large; if everything is still
   * live, forgets the oldest entry so memory stays bounded.
   */
  private evictIfCrowded(): void {
    if (this.attempts.size < this.maxTrackedKeys) return;

    for (const [key, record] of this.attempts) {
      if (this.isExpired(record)) {
        this.attempts.delete(key);
      }
    }

    if (this.attempts.size >= this.maxTrackedKeys) {
      const oldest = this.attempts.keys().next();
      if (!oldest.done) {
        this.attempts.delete(oldest.value);
      }
    }
  }
}
