import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { PrismaService } from '../prisma/prisma.service';

type RequestSample = { method: string; path: string; status: number; durationMs: number; at: string };
type RouteStats = { count: number; errors: number; durations: number[] };
type MinuteBucket = { bucketStart: number; requests: number; errors: number; durationSum: number; durationCount: number };

const HISTORY_MINUTES = 60;
const MAX_ROUTES_TRACKED = 200;

@Injectable()
export class MonitoringService implements OnModuleDestroy {
  private readonly startedAt = Date.now();
  private requests = 0;
  private errors = 0;
  private durations: number[] = [];
  private recentErrors: RequestSample[] = [];
  private readonly routeStats = new Map<string, RouteStats>();
  private readonly buckets = new Map<number, MinuteBucket>();
  private readonly eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
  private lastCpuUsage = process.cpuUsage();
  private lastCpuAt = performance.now();

  constructor(private readonly prisma: PrismaService) {
    this.eventLoopMonitor.enable();
  }

  onModuleDestroy() {
    this.eventLoopMonitor.disable();
  }

  private percentile(values: number[], pct: number) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * pct) - 1)];
  }

  private bucketFor(atMs: number) {
    const bucketStart = Math.floor(atMs / 60_000) * 60_000;
    let bucket = this.buckets.get(bucketStart);
    if (!bucket) {
      bucket = { bucketStart, requests: 0, errors: 0, durationSum: 0, durationCount: 0 };
      this.buckets.set(bucketStart, bucket);
      for (const key of this.buckets.keys()) {
        if (this.buckets.size <= HISTORY_MINUTES) break;
        this.buckets.delete(key);
      }
    }
    return bucket;
  }

  record(sample: RequestSample) {
    this.requests += 1;
    this.durations.push(sample.durationMs);
    if (this.durations.length > 1000) this.durations.shift();

    const routeKey = `${sample.method} ${sample.path}`;
    let route = this.routeStats.get(routeKey);
    if (!route) {
      if (this.routeStats.size >= MAX_ROUTES_TRACKED) {
        const oldestKey = this.routeStats.keys().next().value;
        if (oldestKey) this.routeStats.delete(oldestKey);
      }
      route = { count: 0, errors: 0, durations: [] };
      this.routeStats.set(routeKey, route);
    }
    route.count += 1;
    route.durations.push(sample.durationMs);
    if (route.durations.length > 200) route.durations.shift();

    const bucket = this.bucketFor(new Date(sample.at).getTime());
    bucket.requests += 1;
    bucket.durationSum += sample.durationMs;
    bucket.durationCount += 1;

    if (sample.status >= 500) {
      this.errors += 1;
      route.errors += 1;
      bucket.errors += 1;
      this.recentErrors.unshift(sample);
      this.recentErrors = this.recentErrors.slice(0, 50);
      this.prisma.systemErrorLog
        .create({ data: { method: sample.method, path: sample.path, status: sample.status, durationMs: sample.durationMs, at: new Date(sample.at) } })
        .catch(() => undefined);
    }
  }

  private cpuPercent() {
    const now = performance.now();
    const usage = process.cpuUsage(this.lastCpuUsage);
    const elapsedMs = now - this.lastCpuAt;
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuAt = now;
    if (elapsedMs <= 0) return 0;
    const usedMs = (usage.user + usage.system) / 1000;
    return Math.round((usedMs / elapsedMs) * 100 * 10) / 10;
  }

  async summary() {
    const checkedAt = new Date().toISOString();
    const dbStarted = performance.now();
    let database: 'operational' | 'down' = 'operational';
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { database = 'down'; }
    const databaseLatencyMs = Math.round((performance.now() - dbStarted) * 10) / 10;
    const memory = process.memoryUsage();
    const errorRate = this.requests ? (this.errors / this.requests) * 100 : 0;
    const eventLoopLagMs = Math.round((this.eventLoopMonitor.mean / 1e6) * 10) / 10;
    return {
      checkedAt,
      status: database === 'operational' && errorRate < 5 ? 'operational' : database === 'down' ? 'outage' : 'degraded',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requests: this.requests,
      errors: this.errors,
      errorRate: Math.round(errorRate * 100) / 100,
      latencyP95Ms: Math.round(this.percentile(this.durations, 0.95) * 10) / 10,
      memoryMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      eventLoopLagMs: Number.isFinite(eventLoopLagMs) ? eventLoopLagMs : 0,
      cpuPercent: this.cpuPercent(),
      services: [
        { name: 'واجهة API', status: 'operational', latencyMs: Math.round(this.percentile(this.durations, 0.5) * 10) / 10 },
        { name: 'قاعدة البيانات', status: database, latencyMs: databaseLatencyMs },
      ],
      recentErrors: this.recentErrors,
    };
  }

  history() {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    const points: { at: string; requests: number; errors: number; avgLatencyMs: number }[] = [];
    for (let i = HISTORY_MINUTES - 1; i >= 0; i -= 1) {
      const bucketStart = now - i * 60_000;
      const bucket = this.buckets.get(bucketStart);
      points.push({
        at: new Date(bucketStart).toISOString(),
        requests: bucket?.requests ?? 0,
        errors: bucket?.errors ?? 0,
        avgLatencyMs: bucket && bucket.durationCount ? Math.round((bucket.durationSum / bucket.durationCount) * 10) / 10 : 0,
      });
    }
    return points;
  }

  routes() {
    const rows = [...this.routeStats.entries()].map(([key, stats]) => {
      const [method, ...pathParts] = key.split(' ');
      return {
        method,
        path: pathParts.join(' '),
        count: stats.count,
        errors: stats.errors,
        errorRate: stats.count ? Math.round((stats.errors / stats.count) * 10000) / 100 : 0,
        p95Ms: Math.round(this.percentile(stats.durations, 0.95) * 10) / 10,
      };
    });
    return {
      slowest: [...rows].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 10),
      mostErrors: [...rows].filter((r) => r.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 10),
      busiest: [...rows].sort((a, b) => b.count - a.count).slice(0, 10),
    };
  }

  async errorLogs(limit: number, before?: string) {
    const logs = await this.prisma.systemErrorLog.findMany({
      where: before ? { at: { lt: new Date(before) } } : undefined,
      orderBy: { at: 'desc' },
      take: limit,
    });
    return logs.map((log) => ({
      id: log.id,
      method: log.method,
      path: log.path,
      status: log.status,
      durationMs: log.durationMs,
      at: log.at.toISOString(),
    }));
  }

  async prometheus() {
    const data = await this.summary();
    return [
      '# HELP souq_http_requests_total Total HTTP requests',
      '# TYPE souq_http_requests_total counter',
      `souq_http_requests_total ${data.requests}`,
      '# HELP souq_http_errors_total Total HTTP 5xx responses',
      '# TYPE souq_http_errors_total counter',
      `souq_http_errors_total ${data.errors}`,
      '# HELP souq_http_latency_p95_milliseconds HTTP p95 latency',
      '# TYPE souq_http_latency_p95_milliseconds gauge',
      `souq_http_latency_p95_milliseconds ${data.latencyP95Ms}`,
      '# HELP souq_process_memory_megabytes Process resident memory',
      '# TYPE souq_process_memory_megabytes gauge',
      `souq_process_memory_megabytes ${data.memoryMb}`,
      '# HELP souq_process_heap_used_megabytes Process heap used',
      '# TYPE souq_process_heap_used_megabytes gauge',
      `souq_process_heap_used_megabytes ${data.heapUsedMb}`,
      '# HELP souq_event_loop_lag_milliseconds Mean event loop delay',
      '# TYPE souq_event_loop_lag_milliseconds gauge',
      `souq_event_loop_lag_milliseconds ${data.eventLoopLagMs}`,
      '# HELP souq_process_cpu_percent Process CPU usage percent since last scrape',
      '# TYPE souq_process_cpu_percent gauge',
      `souq_process_cpu_percent ${data.cpuPercent}`,
      '# HELP souq_database_up Database availability',
      '# TYPE souq_database_up gauge',
      `souq_database_up ${data.services[1].status === 'operational' ? 1 : 0}`,
      '',
    ].join('\n');
  }
}
