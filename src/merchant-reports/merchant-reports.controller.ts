import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MerchantReportsService } from './merchant-reports.service';
import { InventoryReportsService } from './inventory-reports.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import type { FeatureKey } from '../entitlements/feature-keys';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  adjustStockSchema,
  inventoryProductsQuerySchema,
  merchantReportsQuerySchema,
  stockMovementsQuerySchema,
  transactionsQuerySchema,
} from './dto/merchant-reports.schemas';
import type {
  AdjustStockDto,
  InventoryProductsQueryDto,
  MerchantReportsQueryDto,
  StockMovementsQueryDto,
  TransactionsQueryDto,
} from './dto/merchant-reports.schemas';

@Controller('merchant/reports')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class MerchantReportsController {
  constructor(
    private readonly merchantReportsService: MerchantReportsService,
    private readonly inventoryReportsService: InventoryReportsService,
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  private async ensureFeature(storeId: string, key: FeatureKey) {
    const hasFeature = await this.entitlements.hasFeature(storeId, key);
    if (!hasFeature) {
      throw new ForbiddenException(
        'هذه الميزة غير متاحة ضمن باقتك الحالية. يرجى ترقية الباقة للوصول إليها.',
      );
    }
  }

  @Get()
  reports(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(merchantReportsQuerySchema))
    query: MerchantReportsQueryDto,
  ) {
    return this.merchantReportsService.reports(this.storeIdOf(user), query);
  }

  @Get('inventory/summary')
  async inventorySummary(@CurrentUser() user: AuthUser) {
    const storeId = this.storeIdOf(user);
    await this.ensureFeature(storeId, 'REPORTS_INVENTORY_ANALYTICS');
    return this.inventoryReportsService.summary(storeId);
  }

  @Get('inventory/products')
  async inventoryProducts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(inventoryProductsQuerySchema))
    query: InventoryProductsQueryDto,
  ) {
    const storeId = this.storeIdOf(user);
    await this.ensureFeature(storeId, 'REPORTS_INVENTORY_ANALYTICS');
    return this.inventoryReportsService.products(storeId, query);
  }

  // Ungated deliberately: knowing which products sell is core operational
  // insight every merchant needs regardless of tier, not a premium upsell.
  @Get('inventory/product-performance')
  productPerformance(@CurrentUser() user: AuthUser) {
    return this.inventoryReportsService.productPerformance(
      this.storeIdOf(user),
    );
  }

  @Get('inventory/movements')
  async stockMovements(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stockMovementsQuerySchema))
    query: StockMovementsQueryDto,
  ) {
    const storeId = this.storeIdOf(user);
    await this.ensureFeature(storeId, 'REPORTS_STOCK_MOVEMENTS');
    return this.inventoryReportsService.stockMovements(storeId, query);
  }

  @Get('transactions')
  async transactions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactionsQuerySchema))
    query: TransactionsQueryDto,
  ) {
    const storeId = this.storeIdOf(user);
    await this.ensureFeature(storeId, 'REPORTS_TRANSACTIONS');
    return this.inventoryReportsService.transactions(storeId, query);
  }

  @Get('warehouses')
  warehouses(@CurrentUser() user: AuthUser) {
    return this.inventoryReportsService.warehouses(this.storeIdOf(user));
  }

  @Get('returns-damages')
  returnsAndDamages(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stockMovementsQuerySchema))
    query: StockMovementsQueryDto,
  ) {
    return this.inventoryReportsService.returnsAndDamages(this.storeIdOf(user), query);
  }

  @Post('inventory/adjust')
  async adjustStock(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(adjustStockSchema)) dto: AdjustStockDto,
  ) {
    const storeId = this.storeIdOf(user);
    await this.prisma.$transaction(async (tx) => {
      // Products are store-scoped everywhere else in this codebase via a
      // storeId filter on the write itself; adjustStock doesn't take one, so
      // ownership is verified here before any mutation runs.
      const product = await tx.product.findFirst({
        where: { id: dto.productId, storeId },
        select: { id: true },
      });
      if (!product) {
        throw new ForbiddenException('هذا المنتج لا ينتمي لمتجرك');
      }
      if (dto.variantId) {
        const variant = await tx.productVariant.findFirst({
          where: { id: dto.variantId, productId: dto.productId },
          select: { id: true },
        });
        if (!variant) {
          throw new ForbiddenException('هذا المتغيّر لا ينتمي لهذا المنتج');
        }
      }
      await this.inventoryService.adjustStock(tx, { ...dto, storeId });
    });
    return { success: true };
  }
}
