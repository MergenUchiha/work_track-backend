import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

/**
 * Throttler guard that exempts admins and health checks, and tracks
 * authenticated callers by user id instead of IP.
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
    // Track authenticated callers by user id
    if (req.user?.sub) {
      return Promise.resolve(`user-${req.user.sub}`);
    }

    // Fall back to the client IP
    return Promise.resolve(req.ip || req.socket.remoteAddress);
  }
}
