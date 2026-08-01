import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    systemErrorLog: { create: jest.fn().mockReturnValue({ catch: jest.fn() }) },
  };

  beforeEach(() => jest.clearAllMocks());

  it('reports operational services and aggregates request metrics', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const service = new MonitoringService(prisma as never);
    service.record({ method: 'GET', path: '/api/products', status: 200, durationMs: 20, at: new Date().toISOString() });
    service.record({ method: 'POST', path: '/api/orders', status: 500, durationMs: 80, at: new Date().toISOString() });
    const summary = await service.summary();
    expect(summary.requests).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.errorRate).toBe(50);
    expect(summary.services[1].status).toBe('operational');
    expect(summary.recentErrors).toHaveLength(1);
  });

  it('reports an outage when the database check fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('offline'));
    const summary = await new MonitoringService(prisma as never).summary();
    expect(summary.status).toBe('outage');
    expect(summary.services[1].status).toBe('down');
  });
});
