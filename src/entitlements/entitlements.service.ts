import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureKey } from './feature-keys';

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeatureKeys(storeId: string): Promise<FeatureKey[]> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { plan: { select: { featureKeys: true } } },
    });
    return (store?.plan?.featureKeys ?? []) as FeatureKey[];
  }

  async hasFeature(storeId: string, key: FeatureKey): Promise<boolean> {
    const keys = await this.getFeatureKeys(storeId);
    return keys.includes(key);
  }
}
