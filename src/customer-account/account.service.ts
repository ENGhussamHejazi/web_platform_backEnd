import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  OrderActivityType,
  OrderStatus,
  Prisma,
  Role,
} from '../../generated/prisma';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CancelOrderDto,
  CreateAddressDto,
  ListMyOrdersQueryDto,
  RequestReturnDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/account.schemas';
import type { StoredFile } from '../storage/storage.interface';
import {
  NOOP,
  TransactionalMailService,
} from '../mail/transactional-mail.service';

const CANCELLATION_REASON_LABELS: Record<string, string> = {
  ORDERED_BY_MISTAKE: 'تم الطلب بالخطأ',
  FOUND_BETTER_PRICE: 'وجد سعراً أفضل',
  CHANGE_SHIPPING_ADDRESS: 'تغيير عنوان الشحن',
  CHANGE_PRODUCTS: 'تعديل المنتجات المطلوبة',
  DELIVERY_TOO_LONG: 'مدة التوصيل طويلة',
  OTHER: 'سبب آخر',
};

// Orders can only be customer-cancelled before they've left the merchant's
// hands. Once SHIPPED/OUT_FOR_DELIVERY/DELIVERED, cancellation is no longer
// offered (a return request is the correct path after delivery).
const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
];

const ORDER_LIST_SELECT = {
  id: true,
  status: true,
  subtotal: true,
  shippingCost: true,
  total: true,
  loyaltyDiscount: true,
  pointsRedeemed: true,
  governorate: true,
  shippingAddress: true,
  cityId: true,
  cityNameSnapshot: true,
  estimatedDeliveryTimeSnapshot: true,
  fulfillmentType: true,
  paymentMethod: true,
  createdAt: true,
  cancelReason: true,
  cancelledAt: true,
  items: {
    select: {
      id: true,
      productName: true,
      variantLabel: true,
      quantity: true,
      price: true,
      product: {
        select: {
          id: true,
          images: { take: 1, orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

const ORDER_DETAIL_SELECT = {
  ...ORDER_LIST_SELECT,
  cancelNote: true,
  confirmedAt: true,
  processingAt: true,
  shippedAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
  returns: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      status: true,
      reason: true,
      customerDescription: true,
      createdAt: true,
      completedAt: true,
      items: {
        select: {
          id: true,
          orderItemId: true,
          requestedQty: true,
          approvedQty: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

@Injectable()
export class CustomerAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly mail: TransactionalMailService,
  ) {}

  private async getStoreOrThrow(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        currency: true,
        primaryColor: true,
        logoUrl: true,
        returnsEnabled: true,
      },
    });
    if (!store) throw new NotFoundException('المتجر غير موجود');
    return store;
  }

  private assertCustomerOfStore(storeId: string, user: AuthUser) {
    if (user.role !== Role.CUSTOMER || user.storeId !== storeId) {
      throw new ForbiddenException('غير مصرح لك بالوصول إلى هذا المورد');
    }
  }

  private toOrderDto(order: {
    status: OrderStatus;
    subtotal: Prisma.Decimal;
    shippingCost: Prisma.Decimal;
    total: Prisma.Decimal;
    loyaltyDiscount: Prisma.Decimal;
    items: {
      id: string;
      productName: string;
      variantLabel: string | null;
      quantity: Prisma.Decimal;
      price: Prisma.Decimal;
      product: { id: string; images: { url: string }[] } | null;
    }[];
    _count: { items: number };
    [key: string]: unknown;
  }) {
    const {
      _count,
      items,
      subtotal,
      shippingCost,
      total,
      loyaltyDiscount,
      ...rest
    } = order;
    return {
      ...rest,
      subtotal: Number(subtotal),
      shippingCost: Number(shippingCost),
      total: Number(total),
      loyaltyDiscount: Number(loyaltyDiscount),
      itemCount: _count.items,
      cancellable: CANCELLABLE_STATUSES.includes(order.status),
      items: items.map((i) => ({
        id: i.id,
        productId: i.product?.id ?? null,
        productName: i.productName,
        variantLabel: i.variantLabel,
        quantity: Number(i.quantity),
        price: Number(i.price),
        thumbnailUrl: i.product?.images[0]?.url ?? null,
      })),
    };
  }

  async getProfile(slug: string, user: AuthUser) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        dateOfBirth: true,
        gender: true,
        preferredLanguage: true,
        loyaltyPoints: true,
        createdAt: true,
      },
    });
    if (!profile) throw new NotFoundException('الحساب غير موجود');
    return profile;
  }

  async updateProfile(slug: string, user: AuthUser, dto: UpdateProfileDto) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);

    let dateOfBirth: Date | undefined;
    if (dto.dateOfBirth) {
      const parsed = new Date(dto.dateOfBirth);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('تاريخ الميلاد غير صالح');
      }
      dateOfBirth = parsed;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.preferredLanguage !== undefined
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        dateOfBirth: true,
        gender: true,
        preferredLanguage: true,
        loyaltyPoints: true,
        createdAt: true,
      },
    });
    return updated;
  }

  async updateAvatar(slug: string, user: AuthUser, file: StoredFile) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: file.url },
      select: { avatarUrl: true },
    });
    return updated;
  }

  async getOverview(slug: string, user: AuthUser) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);

    const [profile, statusCounts, recentOrders] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          loyaltyPoints: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { storeId: store.id, customerId: user.id },
        _count: { status: true },
      }),
      this.prisma.order.findMany({
        where: { storeId: store.id, customerId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: ORDER_LIST_SELECT,
      }),
    ]);
    if (!profile) throw new NotFoundException('الحساب غير موجود');

    const counts: Record<string, number> = {};
    for (const c of statusCounts) counts[c.status] = c._count.status;

    const processing = (counts.CONFIRMED ?? 0) + (counts.PROCESSING ?? 0);
    const delivering = (counts.SHIPPED ?? 0) + (counts.OUT_FOR_DELIVERY ?? 0);
    const totalOrders = statusCounts.reduce(
      (sum, c) => sum + c._count.status,
      0,
    );

    return {
      profile,
      counts: {
        totalOrders,
        pending: counts.PENDING ?? 0,
        processing,
        delivering,
        completed: counts.DELIVERED ?? 0,
        cancelled: counts.CANCELLED ?? 0,
      },
      recentOrders: recentOrders.map((o) => this.toOrderDto(o)),
    };
  }

  async listOrders(slug: string, user: AuthUser, query: ListMyOrdersQueryDto) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);

    const where: Prisma.OrderWhereInput = {
      storeId: store.id,
      customerId: user.id,
    };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.id = { contains: query.search, mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ORDER_LIST_SELECT,
      }),
    ]);

    return {
      items: orders.map((o) => this.toOrderDto(o)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getOrder(slug: string, user: AuthUser, orderId: string) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id, customerId: user.id },
      select: ORDER_DETAIL_SELECT,
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return this.toOrderDto(order);
  }

  async getInvoice(slug: string, user: AuthUser, orderId: string) {
    const order = await this.getOrder(slug, user, orderId);
    const store = await this.getStoreOrThrow(slug);
    return { store, order };
  }

  async cancelOrder(
    slug: string,
    user: AuthUser,
    orderId: string,
    dto: CancelOrderDto,
  ) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id, customerId: user.id },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new ConflictException(
        'لا يمكن إلغاء هذا الطلب في حالته الحالية. يمكنك التواصل مع الدعم أو طلب إرجاع بعد التسليم.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: dto.reason,
          cancelNote: dto.note,
          cancelledAt: new Date(),
        },
        select: ORDER_DETAIL_SELECT,
      });
      await this.inventory.releaseReservation(tx, orderId);
      return order;
    });

    // Confirms the cancellation to the customer and alerts the merchant, who
    // may already have started preparing the order.
    this.mail
      .sendOrderCancelledByCustomer(
        orderId,
        CANCELLATION_REASON_LABELS[dto.reason] ?? dto.reason,
        dto.note,
      )
      .catch(NOOP);

    return this.toOrderDto(updated);
  }

  async requestReturn(
    slug: string,
    user: AuthUser,
    orderId: string,
    dto: RequestReturnDto,
  ) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    if (!store.returnsEnabled) {
      throw new ForbiddenException('طلبات الإرجاع غير مفعّلة في هذا المتجر');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id, customerId: user.id },
      select: {
        id: true,
        status: true,
        items: { select: { id: true, quantity: true } },
        returns: {
          where: { status: { notIn: ['REJECTED', 'COMPLETED'] } },
          select: { id: true },
        },
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('يمكن طلب الإرجاع بعد تسليم الطلب فقط');
    }
    if (order.returns.length) {
      throw new ConflictException('يوجد طلب إرجاع قيد المعالجة لهذا الطلب');
    }

    const quantities = new Map(
      order.items.map((item) => [item.id, item.quantity]),
    );
    const requestedIds = new Set<string>();
    for (const item of dto.items) {
      const purchasedQty = quantities.get(item.orderItemId);
      if (!purchasedQty || requestedIds.has(item.orderItemId)) {
        throw new BadRequestException('يتضمن طلب الإرجاع منتجاً غير صالح');
      }
      if (purchasedQty.lessThan(item.requestedQty)) {
        throw new BadRequestException('كمية الإرجاع أكبر من الكمية المشتراة');
      }
      requestedIds.add(item.orderItemId);
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.return.create({
        data: {
          orderId,
          storeId: store.id,
          reason: dto.reason,
          customerDescription: dto.customerDescription,
          items: { create: dto.items },
        },
        include: { items: true },
      });
      await tx.orderActivity.create({
        data: {
          orderId,
          storeId: store.id,
          type: OrderActivityType.RETURN_REQUESTED,
          actorId: user.id,
          title: 'طلب العميل إرجاع منتجات',
          description: dto.reason,
        },
      });
      return created;
    });
  }

  // ---------------------------------------------------------------------
  // Saved addresses
  // ---------------------------------------------------------------------

  private toAddressDto(address: {
    id: string;
    governorate: string;
    cityId: string | null;
    cityNameSnapshot: string | null;
    detailedAddress: string;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
    phone: string;
    notes: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    city: {
      id: string;
      nameAr: string;
      nameEn: string | null;
      isActive: boolean;
    } | null;
  }) {
    const { city, ...rest } = address;
    return {
      ...rest,
      // Prefer the live city name, falling back to the snapshot if the city
      // was later archived/deleted — keeps the address book usable even
      // when a City row disappears.
      cityName: city?.nameAr ?? address.cityNameSnapshot,
      cityActive: city?.isActive ?? false,
    };
  }

  private async assertCityInGovernorate(cityId: string, governorate: string) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city || city.governorate !== governorate) {
      throw new BadRequestException('المدينة لا تنتمي إلى المحافظة المحددة');
    }
    return city;
  }

  async listAddresses(slug: string, user: AuthUser) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const addresses = await this.prisma.customerAddress.findMany({
      where: { customerId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: {
        city: {
          select: { id: true, nameAr: true, nameEn: true, isActive: true },
        },
      },
    });
    return addresses.map((a) => this.toAddressDto(a));
  }

  async createAddress(slug: string, user: AuthUser, dto: CreateAddressDto) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const city = await this.assertCityInGovernorate(
      dto.cityId,
      dto.governorate,
    );

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: user.id },
          data: { isDefault: false },
        });
      }
      const count = await tx.customerAddress.count({
        where: { customerId: user.id },
      });
      return tx.customerAddress.create({
        data: {
          customerId: user.id,
          governorate: dto.governorate,
          cityId: dto.cityId,
          cityNameSnapshot: city.nameAr,
          detailedAddress: dto.detailedAddress,
          building: dto.building,
          floor: dto.floor,
          apartment: dto.apartment,
          landmark: dto.landmark,
          phone: dto.phone,
          notes: dto.notes,
          isDefault: dto.isDefault || count === 0,
        },
        include: {
          city: {
            select: { id: true, nameAr: true, nameEn: true, isActive: true },
          },
        },
      });
    });
    return this.toAddressDto(address);
  }

  private async getAddressOrThrow(user: AuthUser, addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({
      where: { id: addressId },
      include: {
        city: {
          select: { id: true, nameAr: true, nameEn: true, isActive: true },
        },
      },
    });
    if (!address || address.customerId !== user.id) {
      throw new NotFoundException('العنوان غير موجود');
    }
    return address;
  }

  async updateAddress(
    slug: string,
    user: AuthUser,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const existing = await this.getAddressOrThrow(user, addressId);

    const governorate = dto.governorate ?? existing.governorate;
    let cityId = existing.cityId;
    let cityNameSnapshot = existing.cityNameSnapshot;
    if (dto.cityId) {
      const city = await this.assertCityInGovernorate(dto.cityId, governorate);
      cityId = city.id;
      cityNameSnapshot = city.nameAr;
    }

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: user.id, id: { not: addressId } },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({
        where: { id: addressId },
        data: {
          governorate,
          cityId,
          cityNameSnapshot,
          detailedAddress: dto.detailedAddress,
          building: dto.building,
          floor: dto.floor,
          apartment: dto.apartment,
          landmark: dto.landmark,
          phone: dto.phone,
          notes: dto.notes,
          isDefault: dto.isDefault,
        },
        include: {
          city: {
            select: { id: true, nameAr: true, nameEn: true, isActive: true },
          },
        },
      });
    });
    return this.toAddressDto(address);
  }

  async deleteAddress(slug: string, user: AuthUser, addressId: string) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const existing = await this.getAddressOrThrow(user, addressId);
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    if (existing.isDefault) {
      const next = await this.prisma.customerAddress.findFirst({
        where: { customerId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await this.prisma.customerAddress.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
    return { id: addressId, deleted: true };
  }

  async setDefaultAddress(slug: string, user: AuthUser, addressId: string) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    await this.getAddressOrThrow(user, addressId);
    await this.prisma.$transaction([
      this.prisma.customerAddress.updateMany({
        where: { customerId: user.id },
        data: { isDefault: false },
      }),
      this.prisma.customerAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);
    return { id: addressId, isDefault: true };
  }

  // Revalidates a saved address against the store's *current* delivery
  // configuration — called when a customer picks a saved address at
  // checkout, since the city may have been disabled or its fee changed
  // since the address was saved (the stored address never carries a fee).
  async revalidateAddressForStore(
    slug: string,
    user: AuthUser,
    addressId: string,
  ) {
    const store = await this.getStoreOrThrow(slug);
    this.assertCustomerOfStore(store.id, user);
    const address = await this.getAddressOrThrow(user, addressId);
    if (!address.cityId || !address.city?.isActive) {
      throw new BadRequestException(
        'هذه المدينة لم تعد متاحة، يرجى اختيار مدينة أخرى',
      );
    }
    const zone = await this.prisma.shippingZone.findUnique({
      where: {
        storeId_governorate_cityId: {
          storeId: store.id,
          governorate: address.governorate,
          cityId: address.cityId,
        },
      },
    });
    if (!zone || !zone.isDeliveryAvailable) {
      throw new BadRequestException('التوصيل غير متاح حالياً إلى هذه المدينة');
    }
    return {
      cityId: address.cityId,
      deliveryFee: Number(zone.cost),
      currencyCode: zone.currencyCode,
      estimatedDeliveryTime: zone.estimatedDeliveryTime,
      freeDeliveryMinimum:
        zone.freeDeliveryMinimum != null
          ? Number(zone.freeDeliveryMinimum)
          : null,
      minimumOrderAmount:
        zone.minimumOrderAmount != null
          ? Number(zone.minimumOrderAmount)
          : null,
    };
  }
}
