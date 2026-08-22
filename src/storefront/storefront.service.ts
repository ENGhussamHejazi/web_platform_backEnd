import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingGateway } from '../messaging/messaging.gateway';
import {
  NOOP,
  TransactionalMailService,
} from '../mail/transactional-mail.service';
import {
  Governorate,
  OrderStatus,
  Prisma,
  Role,
  ShippingZone,
  StoreStatus,
} from '../../generated/prisma';
import { GOVERNORATE_VALUES } from '../shipping/dto/shipping.schemas';
import {
  STORE_THEME_TEMPLATES,
  normalizeThemeConfig,
} from '../store-theme/templates';
import type { StoreThemeTemplateId } from '../store-theme/templates';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateGuestOrderDto,
  CreateReviewDto,
  ListPublicProductsQueryDto,
  ListReviewsQueryDto,
} from './dto/storefront.schemas';

const STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  galleryImages: {
    select: { id: true, url: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
  primaryColor: true,
  socialLinks: true,
  contactPhone: true,
  contactWhatsapp: true,
  publicEmail: true,
  currency: true,
  usdToSypRate: true,
  showDualCurrency: true,
  returnPolicy: true,
  returnsEnabled: true,
  shippingPolicy: true,
  pickupEnabled: true,
  pickupAddress: true,
  codAvailable: true,
  bankTransferAvailable: true,
  loyaltyPointsEnabled: true,
  pointsRequiredForDiscount: true,
  loyaltyDiscountPercentage: true,
  legalLinks: true,
} satisfies Prisma.StoreSelect;

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  categoryId: true,
  isFeatured: true,
  isNewArrival: true,
  createdAt: true,
  avgRating: true,
  reviewCount: true,
  hasVariants: true,
  isBox: true,
  boxMaxItems: true,
  soldByWeight: true,
  weightUnit: true,
  minOrderQuantity: true,
  stepQuantity: true,
  category: { select: { id: true, name: true } },
  images: {
    select: { id: true, url: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      size: true,
      color: true,
      colorHex: true,
      price: true,
      compareAtPrice: true,
      stock: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  boxItems: {
    select: {
      itemProduct: {
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          isActive: true,
          images: {
            select: { url: true },
            take: 1,
            orderBy: { sortOrder: 'asc' as const },
          },
        },
      },
    },
    where: { itemProduct: { isActive: true } },
    orderBy: { sortOrder: 'asc' as const },
  },
  boxPresets: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      items: {
        select: { itemProductId: true, quantity: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.ProductSelect;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

const ORDER_RESPONSE_SELECT = {
  id: true,
  status: true,
  subtotal: true,
  shippingCost: true,
  total: true,
  loyaltyDiscount: true,
  pointsRedeemed: true,
  usdToSypRateSnapshot: true,
  governorate: true,
  shippingAddress: true,
  cityId: true,
  cityNameSnapshot: true,
  estimatedDeliveryTimeSnapshot: true,
  fulfillmentType: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      variantId: true,
      variantLabel: true,
      quantity: true,
      price: true,
      parentOrderItemId: true,
    },
  },
} satisfies Prisma.OrderSelect;

interface OrderLineChild {
  productId: string;
  productName: string;
  quantity: number;
  price: Prisma.Decimal;
}

type OrderLine =
  | {
      kind: 'simple';
      productId: string;
      productName: string;
      variantId?: string;
      variantLabel?: string;
      quantity: number;
      price: Prisma.Decimal;
    }
  | {
      kind: 'box';
      productId: string;
      productName: string;
      quantity: number;
      price: Prisma.Decimal;
      children: OrderLineChild[];
    };

const GENERIC_MAINTENANCE_MESSAGE =
  'المتجر قيد الصيانة حالياً، يرجى المحاولة مرة أخرى لاحقاً.';

// Discriminated result returned by resolveStore — every branch other than
// ACTIVE is intentionally limited to customer-safe fields only (never the
// store id, status enum, statusNote, planId, or any other internal detail).
export type StoreResolution =
  | { state: 'NOT_FOUND' }
  | { state: 'PENDING_APPROVAL'; name: string }
  | { state: 'DISABLED'; name: string }
  | { state: 'MAINTENANCE'; name: string; message: string }
  | { state: 'OPENING_SOON'; name: string; openingAt: Date }
  | { state: 'SUBSCRIPTION_UNAVAILABLE'; name: string }
  | { state: 'ACTIVE'; store: Record<string, unknown> };

@Injectable()
export class StorefrontService {
  private readonly activeStoreIdCache = new Map<
    string,
    { expiresAt: number; promise: Promise<string> }
  >();
  private readonly bestsellerCache = new Map<
    string,
    { expiresAt: number; promise: Promise<ProductRow[]> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly messagingGateway: MessagingGateway,
    private readonly mail: TransactionalMailService,
  ) {}

  private getCachedActiveStoreId(slug: string) {
    const cached = this.activeStoreIdCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.prisma.store
      .findUnique({
        where: { slug },
        select: { id: true, status: true },
      })
      .then((store) => {
        if (!store || store.status !== StoreStatus.ACTIVE) {
          throw new NotFoundException('المتجر غير موجود');
        }
        return store.id;
      })
      .catch((error) => {
        this.activeStoreIdCache.delete(slug);
        throw error;
      });

    this.activeStoreIdCache.set(slug, {
      expiresAt: Date.now() + 5 * 60_000,
      promise,
    });
    return promise;
  }

  private toProductDto<
    T extends {
      price: Prisma.Decimal;
      compareAtPrice: Prisma.Decimal | null;
      stock: Prisma.Decimal;
      minOrderQuantity?: Prisma.Decimal | null;
      stepQuantity?: Prisma.Decimal | null;
      variants?: {
        price: Prisma.Decimal | null;
        compareAtPrice: Prisma.Decimal | null;
        stock: Prisma.Decimal;
      }[];
      boxItems?: {
        itemProduct: { price: Prisma.Decimal; stock: Prisma.Decimal } & Record<
          string,
          unknown
        >;
      }[];
    },
  >(product: T) {
    return {
      ...product,
      price: Number(product.price),
      compareAtPrice:
        product.compareAtPrice === null ? null : Number(product.compareAtPrice),
      stock: Number(product.stock),
      minOrderQuantity:
        product.minOrderQuantity == null
          ? null
          : Number(product.minOrderQuantity),
      stepQuantity:
        product.stepQuantity == null ? null : Number(product.stepQuantity),
      variants: product.variants?.map((v) => ({
        ...v,
        price: v.price === null ? null : Number(v.price),
        compareAtPrice:
          v.compareAtPrice === null ? null : Number(v.compareAtPrice),
        stock: Number(v.stock),
      })),
      boxItems: product.boxItems?.map((bi) => ({
        ...bi.itemProduct,
        price: Number(bi.itemProduct.price),
        stock: Number(bi.itemProduct.stock),
      })),
    };
  }

  private async getActiveStoreOrThrow(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: { ...STORE_SELECT, status: true },
    });
    if (!store || store.status !== StoreStatus.ACTIVE) {
      throw new NotFoundException('المتجر غير موجود');
    }
    return store;
  }

  async getActiveStoreId(slug: string): Promise<string> {
    const store = await this.getActiveStoreOrThrow(slug);
    return store.id;
  }

  // Resolves a slug to whichever state the customer should see. Unlike
  // getActiveStoreId/getActiveStoreOrThrow (used by the ordering endpoints,
  // which must keep hard-404ing for anything non-ACTIVE), this is the one
  // entry point that tells the storefront shell *why* a store isn't
  // browsable so it can render the right screen instead of a bare 404.
  async resolveStore(slug: string): Promise<StoreResolution> {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: {
        ...STORE_SELECT,
        status: true,
        planId: true,
        openingAt: true,
        maintenanceMessage: true,
        plan: { select: { isActive: true, featureKeys: true } },
        theme: {
          select: {
            publishedTemplateId: true,
            publishedTemplateVersion: true,
            publishedConfig: true,
          },
        },
      },
    });

    if (!store) return { state: 'NOT_FOUND' };

    if (store.status === StoreStatus.PENDING) {
      return { state: 'PENDING_APPROVAL', name: store.name };
    }
    if (
      store.status === StoreStatus.SUSPENDED ||
      store.status === StoreStatus.REJECTED
    ) {
      return { state: 'DISABLED', name: store.name };
    }
    if (store.status === StoreStatus.MAINTENANCE) {
      return {
        state: 'MAINTENANCE',
        name: store.name,
        message: store.maintenanceMessage || GENERIC_MAINTENANCE_MESSAGE,
      };
    }

    // status === ACTIVE from here on
    if (store.openingAt && store.openingAt.getTime() > Date.now()) {
      return {
        state: 'OPENING_SOON',
        name: store.name,
        openingAt: store.openingAt,
      };
    }
    if (!store.planId || store.plan?.isActive === false) {
      return { state: 'SUBSCRIPTION_UNAVAILABLE', name: store.name };
    }

    this.activeStoreIdCache.set(slug, {
      expiresAt: Date.now() + 5 * 60_000,
      promise: Promise.resolve(store.id),
    });

    // Start the slower bestseller query while categories/announcements are
    // loading. By the time the homepage requests its product rails, this
    // result is normally already warm.
    void this.getCachedBestsellerRows(
      store.id,
      { storeId: store.id, isActive: true },
      10,
    ).catch(() => undefined);

    const [categories, announcements] = await Promise.all([
      this.prisma.category.findMany({
        where: { storeId: store.id, isActive: true, isVisible: true },
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          icon: true,
          sortOrder: true,
          parentCategoryId: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.getActiveAnnouncements(store.id),
    ]);

    // Only the STORE_SELECT fields are public — `id`, `status`, `planId`,
    // `openingAt`, `maintenanceMessage`, and `plan` must never reach the
    // customer-facing side (internal tenant id / billing internals).
    const publicStore: Record<string, unknown> = { categories, announcements };
    for (const key of Object.keys(STORE_SELECT)) {
      if (key === 'id') continue;
      publicStore[key] = (store as Record<string, unknown>)[key];
    }
    publicStore.chatEnabled =
      store.plan?.featureKeys?.includes('CUSTOMER_CHAT') ?? false;

    // Only ever the published theme — draftConfig never reaches this path.
    publicStore.theme = store.theme?.publishedConfig
      ? {
          templateId: store.theme.publishedTemplateId,
          templateVersion: store.theme.publishedTemplateVersion,
          config: normalizeThemeConfig(
            store.theme.publishedConfig as never,
            store.theme.publishedTemplateId as StoreThemeTemplateId,
          ),
        }
      : {
          templateId: STORE_THEME_TEMPLATES.MINIMAL.id,
          templateVersion: STORE_THEME_TEMPLATES.MINIMAL.version,
          config: STORE_THEME_TEMPLATES.MINIMAL.defaultConfig,
        };

    return { state: 'ACTIVE', store: publicStore };
  }

  private async getActiveAnnouncements(storeId: string) {
    const now = new Date();
    const announcements = await this.prisma.announcement.findMany({
      where: {
        storeId,
        isVisible: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        message: true,
        link: true,
        type: true,
        endDate: true,
        showOnMobile: true,
      },
    });
    return announcements.filter(
      (a) => !a.endDate || a.endDate.getTime() >= now.getTime(),
    );
  }

  async listHomepageSections(slug: string) {
    const store = await this.getActiveStoreOrThrow(slug);
    const now = new Date();
    const sections = await this.prisma.homepageSection.findMany({
      where: {
        storeId: store.id,
        isVisible: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        type: true,
        title: true,
        subtitle: true,
        description: true,
        config: true,
        showOnMobile: true,
        showOnDesktop: true,
        endDate: true,
      },
    });
    return sections.filter(
      (s) => !s.endDate || s.endDate.getTime() >= now.getTime(),
    );
  }

  /** @deprecated kept for existing internal callers/tests; prefer resolveStore */
  async getStore(slug: string) {
    const resolution = await this.resolveStore(slug);
    if (resolution.state !== 'ACTIVE') {
      throw new NotFoundException('المتجر غير موجود');
    }
    return resolution.store;
  }

  async listProducts(slug: string, query: ListPublicProductsQueryDto) {
    const storeId = await this.getCachedActiveStoreId(slug);

    const where: Prisma.ProductWhereInput = {
      storeId,
      isActive: true,
    };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    if (query.sort === 'bestseller') {
      return this.listBestsellerProducts(storeId, where, query.limit);
    }

    if (query.sort === 'featured') {
      where.isFeatured = true;
    } else if (query.sort === 'discounted') {
      where.compareAtPrice = { not: null };
    } else if (query.sort === 'newest') {
      where.isNewArrival = true;
    }

    let products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      select: PRODUCT_SELECT,
    });

    if (query.sort === 'discounted') {
      products = products.filter(
        (p) => p.compareAtPrice !== null && p.compareAtPrice.gt(p.price),
      );
    }

    return products.map((p) => this.toProductDto(p));
  }

  // `totalSold` is updated atomically with stock when an order is created,
  // avoiding an OrderItem aggregation on every storefront visit.
  private async listBestsellerProducts(
    storeId: string,
    where: Prisma.ProductWhereInput,
    limit?: number,
  ) {
    const products = await this.getCachedBestsellerRows(
      storeId,
      where,
      limit ?? 12,
    );
    return products.map((product) => this.toProductDto(product));
  }

  private getCachedBestsellerRows(
    storeId: string,
    where: Prisma.ProductWhereInput,
    limit: number,
  ) {
    const key = `${storeId}:${limit}`;
    const cached = this.bestsellerCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = Promise.resolve(
      this.prisma.product.findMany({
        where: { ...where, storeId, totalSold: { gt: 0 } },
        orderBy: [{ totalSold: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: PRODUCT_SELECT,
      }),
    ).catch((error) => {
      this.bestsellerCache.delete(key);
      throw error;
    });
    this.bestsellerCache.set(key, {
      expiresAt: Date.now() + 5 * 60_000,
      promise,
    });
    return promise;
  }

  private invalidateBestsellerCache(storeId: string) {
    for (const key of this.bestsellerCache.keys()) {
      if (key.startsWith(`${storeId}:`)) this.bestsellerCache.delete(key);
    }
  }

  async getProduct(slug: string, productId: string) {
    const store = await this.getActiveStoreOrThrow(slug);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId: store.id, isActive: true },
      select: PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return this.toProductDto(product);
  }

  async listShippingZones(slug: string) {
    const store = await this.getActiveStoreOrThrow(slug);
    // Legacy governorate-wide rates only (cityId null) — kept for stores/
    // clients that haven't migrated to city-level pricing. New checkout UIs
    // should use listCitiesForStore instead.
    const zones = await this.prisma.shippingZone.findMany({
      where: { storeId: store.id, cityId: null },
      select: { governorate: true, cost: true },
    });
    return zones.map((z) => ({
      governorate: z.governorate,
      cost: Number(z.cost),
    }));
  }

  async listCitiesForStore(slug: string, governorate?: string) {
    const store = await this.getActiveStoreOrThrow(slug);
    if (
      !governorate ||
      !GOVERNORATE_VALUES.includes(
        governorate as (typeof GOVERNORATE_VALUES)[number],
      )
    ) {
      throw new BadRequestException('يجب اختيار محافظة صالحة');
    }

    const cities = await this.prisma.city.findMany({
      where: { governorate: governorate as Governorate, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { nameAr: 'asc' }],
    });
    if (cities.length === 0) return [];

    const rates = await this.prisma.shippingZone.findMany({
      where: {
        storeId: store.id,
        governorate: governorate as Governorate,
        cityId: { in: cities.map((c) => c.id) },
        isDeliveryAvailable: true,
      },
    });
    const byCity = new Map(rates.map((r) => [r.cityId, r]));

    return cities.flatMap((city) => {
      const rate = byCity.get(city.id);
      if (!rate) return [];
      return [
        {
          id: city.id,
          nameAr: city.nameAr,
          nameEn: city.nameEn,
          deliveryFee: Number(rate.cost),
          currencyCode: rate.currencyCode,
          estimatedDeliveryTime: rate.estimatedDeliveryTime,
          freeDeliveryMinimum:
            rate.freeDeliveryMinimum != null
              ? Number(rate.freeDeliveryMinimum)
              : null,
          minimumOrderAmount:
            rate.minimumOrderAmount != null
              ? Number(rate.minimumOrderAmount)
              : null,
        },
      ];
    });
  }

  private toOrderDto(order: {
    subtotal: Prisma.Decimal;
    shippingCost: Prisma.Decimal;
    total: Prisma.Decimal;
    loyaltyDiscount: Prisma.Decimal;
    usdToSypRateSnapshot: Prisma.Decimal | null;
    items: { price: Prisma.Decimal; quantity: Prisma.Decimal }[];
    [key: string]: unknown;
  }) {
    return {
      ...order,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      total: Number(order.total),
      loyaltyDiscount: Number(order.loyaltyDiscount),
      usdToSypRateSnapshot:
        order.usdToSypRateSnapshot === null
          ? null
          : Number(order.usdToSypRateSnapshot),
      items: order.items.map((i) => ({
        ...i,
        price: Number(i.price),
        quantity: Number(i.quantity),
      })),
    };
  }

  /**
   * Non-weight products must order in whole units. Weight products must
   * respect the merchant's minOrderQuantity/stepQuantity (e.g. min 0.5kg,
   * in 0.25kg steps) — checked here since it can't be expressed in the
   * request-body schema, which has no visibility into the product record.
   */
  private ensureValidQuantity(
    product: {
      name: string;
      soldByWeight: boolean;
      minOrderQuantity: Prisma.Decimal | null;
      stepQuantity: Prisma.Decimal | null;
    },
    quantity: number,
  ) {
    if (!product.soldByWeight) {
      if (!Number.isInteger(quantity)) {
        throw new BadRequestException(
          `الكمية المطلوبة من "${product.name}" يجب أن تكون عدداً صحيحاً`,
        );
      }
      return;
    }
    const min = Number(product.minOrderQuantity ?? 0);
    const step = Number(product.stepQuantity ?? 0);
    if (quantity < min) {
      throw new BadRequestException(
        `الحد الأدنى للطلب من "${product.name}" هو ${min}`,
      );
    }
    if (step > 0) {
      const steps = (quantity - min) / step;
      if (Math.abs(steps - Math.round(steps)) > 1e-6) {
        throw new BadRequestException(
          `الكمية المطلوبة من "${product.name}" يجب أن تتوافق مع خطوات الكمية المسموحة (${step})`,
        );
      }
    }
  }

  private async notifyOwnerOfNewOrder(
    storeId: string,
    orderId: string,
    guestName: string,
    total: Prisma.Decimal,
    currency: string,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true },
    });
    if (!store) return;
    await this.notifications.create({
      userId: store.ownerId,
      type: 'NEW_ORDER',
      title: 'طلب جديد',
      body: `طلب جديد من ${guestName} بقيمة ${Number(total)} ${currency}`,
      metadata: { orderId },
    });
    // Instant push for the dashboard's sound alert — the notifications
    // polling above still catches it within LIVE_REFETCH_INTERVAL_MS if the
    // socket is disconnected.
    this.messagingGateway.emitNewOrder(storeId, orderId);
  }

  async createGuestOrder(
    slug: string,
    dto: CreateGuestOrderDto,
    user?: AuthUser,
  ) {
    const store = await this.getActiveStoreOrThrow(slug);
    const fulfillmentType = dto.fulfillmentType ?? 'DELIVERY';
    // Only link the order to an account when the token belongs to a
    // CUSTOMER of *this* store — a merchant/admin token, or a customer of a
    // different store, must not silently attach the order to their id.
    const customerId =
      user && user.role === Role.CUSTOMER && user.storeId === store.id
        ? user.id
        : undefined;

    if (dto.clientRequestId) {
      const existing = await this.prisma.order.findUnique({
        where: {
          storeId_clientRequestId: {
            storeId: store.id,
            clientRequestId: dto.clientRequestId,
          },
        },
        select: ORDER_RESPONSE_SELECT,
      });
      if (existing) return this.toOrderDto(existing);
    }

    const topLevelProductIds = dto.items.map((i) => i.productId);
    const boxChildProductIds = dto.items.flatMap(
      (i) => i.boxItems?.map((b) => b.productId) ?? [],
    );
    const allProductIds = [
      ...new Set([...topLevelProductIds, ...boxChildProductIds]),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: allProductIds }, storeId: store.id },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        isActive: true,
        hasVariants: true,
        isBox: true,
        boxMaxItems: true,
        soldByWeight: true,
        minOrderQuantity: true,
        stepQuantity: true,
        variants: {
          select: {
            id: true,
            size: true,
            color: true,
            price: true,
            stock: true,
            isActive: true,
          },
        },
        boxItems: { select: { itemProductId: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = new Prisma.Decimal(0);
    const orderLines: OrderLine[] = [];

    for (const item of dto.items) {
      const product = byId.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException('أحد المنتجات في السلة لم يعد متوفراً');
      }
      this.ensureValidQuantity(product, item.quantity);

      if (product.isBox) {
        const chosen = item.boxItems ?? [];
        if (!chosen.length) {
          throw new BadRequestException(
            `يجب اختيار عناصر داخل صندوق "${product.name}"`,
          );
        }
        const totalContents = chosen.reduce((sum, c) => sum + c.quantity, 0);
        if (product.boxMaxItems && totalContents > product.boxMaxItems) {
          throw new BadRequestException(
            `الحد الأقصى لعناصر صندوق "${product.name}" هو ${product.boxMaxItems}`,
          );
        }
        if (product.stock.lessThan(item.quantity)) {
          throw new BadRequestException(
            `الكمية المطلوبة من "${product.name}" غير متوفرة`,
          );
        }
        const eligibleIds = new Set(
          product.boxItems.map((bi) => bi.itemProductId),
        );
        const children: OrderLineChild[] = [];
        for (const child of chosen) {
          const childProduct = byId.get(child.productId);
          if (!childProduct || !childProduct.isActive) {
            throw new BadRequestException('أحد عناصر الصندوق لم يعد متوفراً');
          }
          if (!eligibleIds.has(child.productId)) {
            throw new BadRequestException(
              `"${childProduct.name}" غير متاح ضمن هذا الصندوق`,
            );
          }
          if (childProduct.hasVariants || childProduct.isBox) {
            throw new BadRequestException(
              `لا يمكن إضافة "${childProduct.name}" داخل صندوق`,
            );
          }
          const childQuantity = child.quantity * item.quantity;
          if (childProduct.stock.lessThan(childQuantity)) {
            throw new BadRequestException(
              `الكمية المطلوبة من "${childProduct.name}" غير متوفرة`,
            );
          }
          subtotal = subtotal.add(childProduct.price.mul(childQuantity));
          children.push({
            productId: childProduct.id,
            productName: childProduct.name,
            quantity: childQuantity,
            price: childProduct.price,
          });
        }
        subtotal = subtotal.add(product.price.mul(item.quantity));
        orderLines.push({
          kind: 'box',
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          price: product.price,
          children,
        });
        continue;
      }

      if (product.hasVariants) {
        if (!item.variantId) {
          throw new BadRequestException(
            `يجب اختيار المقاس/اللون لـ "${product.name}"`,
          );
        }
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant || !variant.isActive) {
          throw new BadRequestException(
            'أحد المتغيرات في السلة لم يعد متوفراً',
          );
        }
        if (variant.stock.lessThan(item.quantity)) {
          throw new BadRequestException(
            `الكمية المطلوبة من "${product.name}" غير متوفرة`,
          );
        }
        const price = variant.price ?? product.price;
        subtotal = subtotal.add(price.mul(item.quantity));
        orderLines.push({
          kind: 'simple',
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantLabel: [variant.size, variant.color]
            .filter(Boolean)
            .join(' / '),
          quantity: item.quantity,
          price,
        });
        continue;
      }

      if (product.stock.lessThan(item.quantity)) {
        throw new BadRequestException(
          `الكمية المطلوبة من "${product.name}" غير متوفرة`,
        );
      }
      subtotal = subtotal.add(product.price.mul(item.quantity));
      orderLines.push({
        kind: 'simple',
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        price: product.price,
      });
    }

    if (fulfillmentType === 'PICKUP' && !store.pickupEnabled) {
      throw new BadRequestException('الاستلام من المتجر غير متاح حالياً');
    }

    let zone: ShippingZone | null = null;
    let cityNameSnapshot: string | null = null;

    if (fulfillmentType === 'DELIVERY') {
      if (dto.cityId) {
        // City-level pricing: the frontend sends the exact city the customer
        // picked, and the backend is the sole source of truth for the fee —
        // never trust a price sent from the client.
        const city = await this.prisma.city.findUnique({
          where: { id: dto.cityId },
        });
        if (!city || city.governorate !== dto.governorate) {
          throw new BadRequestException(
            'المدينة المختارة لا تنتمي إلى المحافظة المحددة',
          );
        }
        zone = await this.prisma.shippingZone.findUnique({
          where: {
            storeId_governorate_cityId: {
              storeId: store.id,
              governorate: dto.governorate,
              cityId: dto.cityId,
            },
          },
        });
        if (!zone || !zone.isDeliveryAvailable) {
          throw new BadRequestException(
            'التوصيل غير متاح إلى هذه المدينة حالياً',
          );
        }
        cityNameSnapshot = city.nameAr;
      } else {
        // Legacy governorate-wide rate, for clients not yet sending a cityId.
        // Prisma's compound-unique lookup doesn't accept null for a nullable
        // column, so this is a plain findFirst instead of findUnique.
        zone = await this.prisma.shippingZone.findFirst({
          where: {
            storeId: store.id,
            governorate: dto.governorate!,
            cityId: null,
          },
        });
      }
    }

    if (
      zone?.minimumOrderAmount != null &&
      subtotal.lessThan(zone.minimumOrderAmount)
    ) {
      throw new BadRequestException(
        `الحد الأدنى لهذا الطلب هو ${Number(zone.minimumOrderAmount)} ${zone.currencyCode}`,
      );
    }
    let shippingCost = zone ? zone.cost : new Prisma.Decimal(0);
    if (
      zone?.freeDeliveryMinimum != null &&
      subtotal.greaterThanOrEqualTo(zone.freeDeliveryMinimum)
    ) {
      shippingCost = new Prisma.Decimal(0);
    }

    if (dto.redeemLoyaltyReward && !customerId) {
      throw new BadRequestException('سجّل الدخول لاستخدام نقاط الولاء');
    }
    if (dto.redeemLoyaltyReward && !store.loyaltyPointsEnabled) {
      throw new BadRequestException('برنامج نقاط الولاء غير مفعّل حالياً');
    }
    const pointsToRedeem = dto.redeemLoyaltyReward
      ? store.pointsRequiredForDiscount
      : 0;
    const loyaltyDiscount = dto.redeemLoyaltyReward
      ? subtotal
          .mul(store.loyaltyDiscountPercentage)
          .div(100)
          .toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const total = subtotal.sub(loyaltyDiscount).add(shippingCost);

    let order: Prisma.OrderGetPayload<{ select: typeof ORDER_RESPONSE_SELECT }>;
    try {
      order = await this.createOrderTransaction(
        store.id,
        dto,
        orderLines,
        subtotal,
        shippingCost,
        total,
        customerId,
        loyaltyDiscount,
        pointsToRedeem,
        store.usdToSypRate,
        store.pickupAddress,
        zone
          ? {
              id: zone.id,
              cityId: zone.cityId,
              estimatedDeliveryTime: zone.estimatedDeliveryTime,
            }
          : null,
        cityNameSnapshot,
      );
      this.invalidateBestsellerCache(store.id);
    } catch (err) {
      // Two concurrent requests with the same clientRequestId can both pass
      // the dedupe check above and race to insert; the loser hits the
      // storeId+clientRequestId unique constraint here instead of creating
      // a duplicate order.
      if (
        dto.clientRequestId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.order.findUnique({
          where: {
            storeId_clientRequestId: {
              storeId: store.id,
              clientRequestId: dto.clientRequestId,
            },
          },
          select: ORDER_RESPONSE_SELECT,
        });
        if (existing) return this.toOrderDto(existing);
      }
      throw err;
    }

    // Best-effort: alerts the merchant (and drives their dashboard "new
    // order" sound) — never let a notification hiccup fail a placed order.
    this.notifyOwnerOfNewOrder(
      store.id,
      order.id,
      dto.guestName,
      total,
      store.currency,
    ).catch(() => {});

    // Order confirmation to the buyer + new-order alert to the store owner.
    // Fired after the checkout transaction committed and deliberately not
    // awaited, so SMTP latency never shows up in the checkout response.
    this.mail.sendOrderPlaced(order.id).catch(NOOP);

    return this.toOrderDto(order);
  }

  private async createOrderTransaction(
    storeId: string,
    dto: CreateGuestOrderDto,
    orderLines: OrderLine[],
    subtotal: Prisma.Decimal,
    shippingCost: Prisma.Decimal,
    total: Prisma.Decimal,
    customerId?: string,
    loyaltyDiscount = new Prisma.Decimal(0),
    pointsToRedeem = 0,
    usdToSypRate?: Prisma.Decimal | null,
    pickupAddress?: string | null,
    zoneSnapshot?: {
      id: string;
      cityId: string | null;
      estimatedDeliveryTime: string | null;
    } | null,
    cityNameSnapshot?: string | null,
  ): Promise<Prisma.OrderGetPayload<{ select: typeof ORDER_RESPONSE_SELECT }>> {
    const detailParts = [
      dto.shippingAddress,
      dto.building ? `مبنى: ${dto.building}` : null,
      dto.floor ? `طابق: ${dto.floor}` : null,
      dto.apartment ? `شقة: ${dto.apartment}` : null,
      dto.landmark ? `أقرب معلم: ${dto.landmark}` : null,
      dto.addressNotes ?? null,
    ].filter((part): part is string => Boolean(part));

    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.create({
          data: {
            storeId,
            customerId,
            guestName: dto.guestName,
            guestPhone: dto.guestPhone,
            guestEmail: dto.guestEmail,
            clientRequestId: dto.clientRequestId,
            subtotal,
            shippingCost,
            total,
            loyaltyDiscount,
            pointsRedeemed: pointsToRedeem,
            usdToSypRateSnapshot: usdToSypRate,
            fulfillmentType: dto.fulfillmentType ?? 'DELIVERY',
            shippingAddress:
              dto.fulfillmentType === 'PICKUP'
                ? (pickupAddress ?? 'استلام من المتجر')
                : detailParts.join(' — '),
            governorate:
              dto.fulfillmentType === 'PICKUP' ? 'DAMASCUS' : dto.governorate!,
            cityId: zoneSnapshot?.cityId ?? null,
            cityNameSnapshot: cityNameSnapshot ?? null,
            estimatedDeliveryTimeSnapshot:
              zoneSnapshot?.estimatedDeliveryTime ?? null,
            shippingZoneId: zoneSnapshot?.id ?? null,
          },
          select: { id: true },
        });

        if (pointsToRedeem > 0 && customerId) {
          const deducted = await tx.user.updateMany({
            where: {
              id: customerId,
              storeId,
              loyaltyPoints: { gte: pointsToRedeem },
            },
            data: { loyaltyPoints: { decrement: pointsToRedeem } },
          });
          if (deducted.count !== 1) {
            throw new BadRequestException(
              'رصيد نقاطك غير كافٍ لاستخدام هذا الخصم',
            );
          }
          await tx.loyaltyPointTransaction.create({
            data: {
              storeId,
              customerId,
              orderId: order.id,
              points: pointsToRedeem,
              type: 'REDEEMED',
            },
          });
        }

        // Flat list of (productId, quantity) rows to reserve stock for —
        // box lines contribute the box itself plus every chosen child.
        const stockLines: {
          productId: string;
          variantId?: string;
          productName: string;
          quantity: number;
        }[] = [];

        // IDs are minted client-side (rather than left to the DB default) so
        // every row — including a box's children — can be built into one
        // batched createMany call instead of one round-trip per line; each
        // extra round-trip against Neon risked blowing past Prisma's 5s
        // interactive-transaction timeout on carts with several box items.
        const itemRows: Prisma.OrderItemCreateManyInput[] = [];
        for (const line of orderLines) {
          if (line.kind === 'simple') {
            itemRows.push({
              id: crypto.randomUUID(),
              orderId: order.id,
              productId: line.productId,
              productName: line.productName,
              variantId: line.variantId,
              variantLabel: line.variantLabel,
              quantity: line.quantity,
              price: line.price,
            });
            stockLines.push({
              productId: line.productId,
              variantId: line.variantId,
              productName: line.productName,
              quantity: line.quantity,
            });
            continue;
          }

          // Box line: the box's own row first, then its chosen contents as
          // child rows pointing back at it via parentOrderItemId.
          const parentId = crypto.randomUUID();
          itemRows.push({
            id: parentId,
            orderId: order.id,
            productId: line.productId,
            productName: line.productName,
            quantity: line.quantity,
            price: line.price,
          });
          stockLines.push({
            productId: line.productId,
            productName: line.productName,
            quantity: line.quantity,
          });
          for (const child of line.children) {
            itemRows.push({
              id: crypto.randomUUID(),
              orderId: order.id,
              parentOrderItemId: parentId,
              productId: child.productId,
              productName: child.productName,
              quantity: child.quantity,
              price: child.price,
            });
            stockLines.push({
              productId: child.productId,
              productName: child.productName,
              quantity: child.quantity,
            });
          }
        }
        await tx.orderItem.createMany({ data: itemRows });

        // Reserve stock (available -> reserved) per item, inside the same
        // transaction as order creation, so a stock shortfall rolls the whole
        // order back — matches the atomicity the old direct-decrement had.
        for (const item of stockLines) {
          await this.inventory.reserveForOrder(tx, {
            storeId,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            quantity: item.quantity,
            orderId: order.id,
          });
          await tx.product.update({
            where: { id: item.productId },
            data: { totalSold: { increment: item.quantity } },
          });
        }

        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: ORDER_RESPONSE_SELECT,
        });
      },
      { timeout: 15000 },
    );
  }

  // ---------------------------------------------------------------------
  // Product reviews
  // ---------------------------------------------------------------------

  // Shown next to a review instead of the customer's full name.
  private maskCustomerName(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0]}.`;
  }

  private async getStoreProductOrThrow(storeId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return product;
  }

  private assertCustomerOfStore(store: { id: string }, user: AuthUser) {
    if (user.role !== Role.CUSTOMER || user.storeId !== store.id) {
      throw new ForbiddenException('غير مصرح لك بالوصول إلى هذا المورد');
    }
  }

  private async hasVerifiedPurchase(
    storeId: string,
    customerId: string,
    productId: string,
  ): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: {
        storeId,
        customerId,
        status: OrderStatus.DELIVERED,
        items: { some: { productId } },
      },
      select: { id: true },
    });
    return Boolean(order);
  }

  async listProductReviews(
    slug: string,
    productId: string,
    query: ListReviewsQueryDto,
  ) {
    const store = await this.getActiveStoreOrThrow(slug);
    await this.getStoreProductOrThrow(store.id, productId);

    const limit = query.limit ?? 10;
    const [reviews, product, distributionRaw] = await Promise.all([
      this.prisma.review.findMany({
        where: { storeId: store.id, productId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { avgRating: true, reviewCount: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { storeId: store.id, productId },
        _count: { rating: true },
      }),
    ]);

    const hasMore = reviews.length > limit;
    const page = hasMore ? reviews.slice(0, limit) : reviews;
    const items = page.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      customerName: this.maskCustomerName(r.customer.name),
    }));

    const distribution: Record<'1' | '2' | '3' | '4' | '5', number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const d of distributionRaw) {
      distribution[String(d.rating) as '1' | '2' | '3' | '4' | '5'] =
        d._count.rating;
    }

    return {
      items,
      average: product?.avgRating ?? 0,
      count: product?.reviewCount ?? 0,
      distribution,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async getMyReviewStatus(slug: string, productId: string, user: AuthUser) {
    const store = await this.getActiveStoreOrThrow(slug);
    this.assertCustomerOfStore(store, user);
    await this.getStoreProductOrThrow(store.id, productId);

    const [review, purchased] = await Promise.all([
      this.prisma.review.findUnique({
        where: { productId_customerId: { productId, customerId: user.id } },
        select: { rating: true, comment: true },
      }),
      this.hasVerifiedPurchase(store.id, user.id, productId),
    ]);

    return {
      canReview: purchased,
      review: review
        ? { rating: review.rating, comment: review.comment }
        : null,
    };
  }

  async upsertReview(
    slug: string,
    productId: string,
    user: AuthUser,
    dto: CreateReviewDto,
  ) {
    const store = await this.getActiveStoreOrThrow(slug);
    this.assertCustomerOfStore(store, user);
    await this.getStoreProductOrThrow(store.id, productId);

    const purchased = await this.hasVerifiedPurchase(
      store.id,
      user.id,
      productId,
    );
    if (!purchased) {
      throw new ForbiddenException('يمكنك تقييم المنتج فقط بعد استلام طلبك');
    }

    await this.prisma.review.upsert({
      where: { productId_customerId: { productId, customerId: user.id } },
      create: {
        storeId: store.id,
        productId,
        customerId: user.id,
        rating: dto.rating,
        comment: dto.comment ?? null,
      },
      update: { rating: dto.rating, comment: dto.comment ?? null },
    });

    await this.recomputeProductRating(productId);

    return this.getMyReviewStatus(slug, productId, user);
  }

  async deleteMyReview(slug: string, productId: string, user: AuthUser) {
    const store = await this.getActiveStoreOrThrow(slug);
    this.assertCustomerOfStore(store, user);

    await this.prisma.review.deleteMany({
      where: { productId, customerId: user.id, storeId: store.id },
    });

    await this.recomputeProductRating(productId);

    return { deleted: true };
  }

  private async recomputeProductRating(productId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        avgRating: agg._avg.rating ?? 0,
        reviewCount: agg._count.rating,
      },
    });
  }
}
