import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from '../admin/dto/admin.schemas';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    return plans.map((plan) => this.serialize(plan));
  }

  async listAll() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { order: 'asc' },
    });
    return plans.map((plan) => this.serialize(plan));
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException('يوجد باقة بهذا المعرّف بالفعل');
    }
    const plan = await this.prisma.plan.create({ data: dto });
    return this.serialize(plan);
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.ensurePlanExists(id);
    const plan = await this.prisma.plan.update({ where: { id }, data: dto });
    return this.serialize(plan);
  }

  async remove(id: string) {
    await this.ensurePlanExists(id);
    const storesUsingPlan = await this.prisma.store.count({
      where: { planId: id },
    });
    if (storesUsingPlan > 0) {
      throw new ConflictException(
        'لا يمكن حذف هذه الباقة لأنها مستخدمة من قبل متاجر حالياً',
      );
    }
    await this.prisma.plan.delete({ where: { id } });
  }

  private serialize(plan: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    priceMonthly: unknown;
    priceYearly: unknown;
    maxProducts: number | null;
    maxImagesPerProduct: number;
    features: string[];
    featureKeys?: string[];
    isActive?: boolean;
    order?: number;
  }) {
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly),
      maxProducts: plan.maxProducts,
      maxImagesPerProduct: plan.maxImagesPerProduct,
      features: plan.features,
      featureKeys: plan.featureKeys ?? [],
      isActive: plan.isActive,
      order: plan.order,
    };
  }

  private async ensurePlanExists(id: string) {
    const exists = await this.prisma.plan.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('الباقة غير موجودة');
    }
  }
}
