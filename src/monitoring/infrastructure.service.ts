import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';

const UPGRADE_THRESHOLD_PERCENT = 80;

@Injectable()
export class InfrastructureService {
  private readonly logger = new Logger(InfrastructureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async database() {
    const [{ size_bytes: sizeBytes }] = await this.prisma.$queryRaw<[{ size_bytes: bigint }]>`
      SELECT pg_database_size(current_database()) AS size_bytes
    `;
    const [{ count: activeConnections }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT count(*) AS count FROM pg_stat_activity WHERE datname = current_database()
    `;
    const [{ setting: maxConnectionsRaw }] = await this.prisma.$queryRaw<[{ setting: string }]>`
      SELECT setting FROM pg_settings WHERE name = 'max_connections'
    `;
    const sizeMb = Math.round((Number(sizeBytes) / 1024 / 1024) * 10) / 10;
    const limitMb = this.config.get<number>('monitoring.dbStorageLimitMb');
    const usagePercent = limitMb ? Math.round((sizeMb / limitMb) * 1000) / 10 : undefined;
    return {
      sizeMb,
      limitMb: limitMb ?? null,
      usagePercent: usagePercent ?? null,
      needsUpgrade: usagePercent !== undefined && usagePercent >= UPGRADE_THRESHOLD_PERCENT,
      connections: { active: Number(activeConnections), max: Number(maxConnectionsRaw) },
    };
  }

  async cloudinaryUsage() {
    const cloudName = this.config.get<string>('storage.cloudinary.cloudName');
    const apiKey = this.config.get<string>('storage.cloudinary.apiKey');
    const apiSecret = this.config.get<string>('storage.cloudinary.apiSecret');
    if (!cloudName || !apiKey || !apiSecret) {
      return { configured: false as const };
    }
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    try {
      const usage = await cloudinary.api.usage();
      const usedPercent: number | null =
        typeof usage.credits?.used_percent === 'number' ? Math.round(usage.credits.used_percent * 10) / 10 : null;
      return {
        configured: true as const,
        plan: usage.plan as string,
        storageMb: Math.round(((usage.storage?.usage ?? 0) / 1024 / 1024) * 10) / 10,
        bandwidthMb: Math.round(((usage.bandwidth?.usage ?? 0) / 1024 / 1024) * 10) / 10,
        objects: usage.objects?.usage ?? 0,
        credits: usage.credits ? { usage: usage.credits.usage, limit: usage.credits.limit, usedPercent } : null,
        needsUpgrade: usedPercent !== null && usedPercent >= UPGRADE_THRESHOLD_PERCENT,
      };
    } catch (error) {
      this.logger.error(`تعذّر جلب إحصاءات استخدام Cloudinary: ${(error as Error).message}`);
      return { configured: true as const, error: 'تعذّر الاتصال بواجهة Cloudinary' };
    }
  }
}
