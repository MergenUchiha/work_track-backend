import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

/**
 * Throttler guard that exempts admins and health checks, and picks a tracking
 * key that does not punish unrelated users.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Admins are not rate limited
    if (user && user.role === 'ADMIN') {
      return true;
    }

    // Health probes must never be throttled
    const url = request.url;
    if (url.includes('/health') || url.includes('/metrics')) {
      return true;
    }

    return false;
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    // Authenticated callers are tracked per account
    if (req.user?.sub) {
      return Promise.resolve(`user-${req.user.sub}`);
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    // Sign-in attempts are counted per (address, account) pair rather than per
    // address alone. Keying on the address only means one attacker — or one
    // colleague fat-fingering their password — locks out everyone sharing that
    // address, which behind NAT or a reverse proxy can be the entire user base.
    // Spraying many accounts from one address is still covered by the global
    // per-second and per-minute limits.
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : null;
    if (email) {
      return Promise.resolve(`${ip}:${email}`);
    }

    return Promise.resolve(ip);
  }
}
