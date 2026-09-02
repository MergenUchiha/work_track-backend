import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique id to every request, so a single call can be traced
 * across log lines.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Reuse an incoming id when the caller supplied one
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    (req as any).id = requestId;

    // Echo the id back to the caller
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
