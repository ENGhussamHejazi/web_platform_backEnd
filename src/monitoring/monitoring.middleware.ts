import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class MonitoringMiddleware implements NestMiddleware {
  constructor(private readonly monitoring: MonitoringService) {}
  use(req: Request, res: Response, next: NextFunction) {
    const started = performance.now();
    res.on('finish', () => {
      if (req.path.endsWith('/monitoring/metrics')) return;
      this.monitoring.record({ method: req.method, path: req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id'), status: res.statusCode, durationMs: Math.round((performance.now() - started) * 10) / 10, at: new Date().toISOString() });
    });
    next();
  }
}
