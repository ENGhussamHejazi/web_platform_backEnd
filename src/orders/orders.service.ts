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
  RestockDecision,
} from '../../generated/prisma';
import {
  AssignDriverDto,
  CreateOrderNoteDto,
  CreateRefundDto,
  CreateReturnDto,
  ListOrdersQueryDto,
  ListReturnsQueryDto,
  ReportDeliveryFailureDto,
  UpdateOrderNoteDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
  UpdateReturnDto,
} from './dto/orders.schemas';

type Tx = Prisma.TransactionClient;

const ORDER_LIST_SELECT = {
  id: true,
  status: true,
  paymentStatus: true,
  subtotal: true,
  shippingCost: true,
  total: true,
  loyaltyDiscount: true,
  pointsRedeemed: true,
  usdToSypRateSnapshot: true,
  paidAmount: true,
  governorate: true,
  shippingAddress: true,
  cityId: true,
  cityNameSnapshot: true,
  estimatedDeliveryTimeSnapshot: true,
  fulfillmentType: true,
  paymentMethod: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  driverName: true,
  createdAt: true,
  customer: { select: { name: true, email: true, phone: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

const ORDER_DETAIL_SELECT = {
  ...ORDER_LIST_SELECT,
  customerId: true,
  clientRequestId: true,
  updatedAt: true,
  cancelReason: true,
  cancelNote: true,
  cancelledAt: true,
  confirmedAt: true,
  processingAt: true,
  shippedAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
  paymentReference: true,
  paymentProofUrl: true,
  paymentCollectedById: true,
  paymentDate: true,
  assignedEmployeeId: true,
  driverPhone: true,
  trackingNumber: true,
  estimatedDeliveryAt: true,
  pickedUpAt: true,
  deliveryFailedAt: true,
  deliveryFailureReason: true,
  store: { select: { currency: true, name: true, logoUrl: true, usdToSypRate: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      quantity: true,
      price: true,
      product: {
        select: {
          images: { take: 1, orderBy: { sortOrder: 'asc' as const } },
          category: { select: { name: true } },
        },
      },
      returnItems: {
        select: {
          id: true,
          returnId: true,
          requestedQty: true,
          approvedQty: true,
          restockDecision: true,
        },
      },
    },
  },
  notes: { orderBy: { createdAt: 'desc' as const } },
  activities: { orderBy: { createdAt: 'desc' as const } },
  returns: {
    orderBy: { createdAt: 'desc' as const },
    include: { items: true, images: true, refunds: true },
  },
  refunds: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderSelect;

const STAGE_TIMESTAMP_FIELD: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.CONFIRMED]: 'confirmedAt',
  [OrderStatus.PROCESSING]: 'processingAt',
  [OrderStatus.SHIPPED]: 'shippedAt',
  [OrderStatus.OUT_FOR_DELIVERY]: 'outForDeliveryAt',
  [OrderStatus.DELIVERED]: 'deliveredAt',
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private toMoney<
    T extends {
      subtotal: Prisma.Decimal;
      shippingCost: Prisma.Decimal;
      total: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
    },
  >(order: T) {
    return {
      ...order,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      total: Number(order.total),
      paidAmount: Number(order.paidAmount),
      outstandingAmount: Number(order.total) - Number(order.paidAmount),
    };
  }

  private async logActivity(
    tx: Tx,
    params: {
      orderId: string;
      storeId: string;
      type: OrderActivityType;
      actorId?: string | null;
      title: string;
      description?: string;
      previousValue?: string;
      newValue?: string;
    },
  ) {
    await tx.orderActivity.create({
      data: {
        orderId: params.orderId,
        storeId: params.storeId,
        type: params.type,
        actorId: params.actorId ?? null,
        title: params.title,
        description: params.description,
        previousValue: params.previousValue,
        newValue: params.newValue,
      },
    });
  }

  async listReturns(storeId: string, query: ListReturnsQueryDto) {
    return this.prisma.return.findMany({
      where: {
        storeId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        reason: true,
        customerDescription: true,
        createdAt: true,
        completedAt: true,
        order: {
          select: {
            id: true,
            total: true,
            createdAt: true,
            customer: { select: { name: true, email: true, phone: true } },
            guestName: true,
            guestPhone: true,
          },
        },
        items: {
          select: {
            id: true,
            requestedQty: true,
            approvedQty: true,
            orderItem: {
              select: { productName: true, variantLabel: true },
            },
          },
        },
      },
    });
  }

  private availableActions(order: {
    status: OrderStatus;
    paymentStatus: string;
    paidAmount: number;
  }): string[] {
    const actions: string[] = ['add_note', 'update_payment', 'view_invoice'];
    if (order.status !== OrderStatus.CANCELLED) {
      actions.push('update_status', 'assign_driver');
    }
    if (
      ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status as string)
    ) {
      actions.push('cancel_order');
    }
    if (order.status === OrderStatus.DELIVERED) {
      actions.push('start_return');
    }
    if (order.paidAmount > 0) {
      actions.push('issue_refund');
    }
    return actions;
  }

  async list(storeId: string, query: ListOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = { storeId };
    if (query.status) where.status = query.status;
    if (query.governorate) where.governorate = query.governorate as Prisma.OrderWhereInput['governorate'];
    if (query.cityId) where.cityId = query.cityId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: ORDER_LIST_SELECT,
    });
    return orders.map((o) => ({
      ...this.toMoney(o),
      itemCount: o._count.items,
      _count: undefined,
    }));
  }

  async get(storeId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, storeId },
      select: ORDER_DETAIL_SELECT,
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const refundTotal = order.refunds
      .filter((r) => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    let customerStats: {
      previousOrderCount: number;
      totalSpent: number;
      customerSince: Date;
    } | null = null;
    if (order.customerId) {
      const [agg, customer] = await Promise.all([
        this.prisma.order.aggregate({
          where: {
            storeId,
            customerId: order.customerId,
            id: { not: id },
          },
          _count: { _all: true },
          _sum: { total: true },
        }),
        this.prisma.user.findUnique({
          where: { id: order.customerId },
          select: { createdAt: true },
        }),
      ]);
      customerStats = {
        previousOrderCount: agg._count._all,
        totalSpent: Number(agg._sum.total ?? 0),
        customerSince: customer?.createdAt ?? order.createdAt,
      };
    }

    const inventoryMovements = await this.prisma.stockMovement.findMany({
      where: { relatedOrderId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        quantityBefore: true,
        quantityChanged: true,
        quantityAfter: true,
        productId: true,
        createdAt: true,
        product: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });

    return {
      ...this.toMoney(order),
      currency: order.store.currency,
      usdToSypRateSnapshot: order.usdToSypRateSnapshot === null ? null : Number(order.usdToSypRateSnapshot),
      refundTotal,
      customerStats,
      inventoryMovements,
      items: order.items.map((i) => ({
        ...i,
        price: Number(i.price),
        thumbnailUrl: i.product?.images[0]?.url ?? null,
        category: i.product?.category?.name ?? null,
        product: undefined,
      })),
      returns: order.returns.map((r) => ({
        ...r,
        refunds: r.refunds.map((f) => ({ ...f, amount: Number(f.amount) })),
      })),
      refunds: order.refunds.map((f) => ({ ...f, amount: Number(f.amount) })),
      availableActions: this.availableActions({
        status: order.status,
        paymentStatus: order.paymentStatus,
        paidAmount: Number(order.paidAmount),
      }),
      _count: undefined,
    };
  }

  private async requireOrder(storeId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, storeId },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return order;
  }

  private assertNotStale(
    order: { updatedAt: Date },
    expectedUpdatedAt?: string,
  ) {
    if (
      expectedUpdatedAt &&
      new Date(expectedUpdatedAt).getTime() !== order.updatedAt.getTime()
    ) {
      throw new ConflictException(
        'تم تعديل هذا الطلب من مكان آخر — يرجى تحديث الصفحة',
      );
    }
  }

  async updateStatus(
    storeId: string,
    id: string,
    dto: UpdateOrderStatusDto,
    actorId: string,
  ) {
    const existing = await this.requireOrder(storeId, id);
    this.assertNotStale(existing, dto.expectedUpdatedAt);

    if (dto.status === OrderStatus.CANCELLED && !dto.reason) {
      throw new BadRequestException('يرجى إدخال سبب الإلغاء');
    }

    const timestampField = STAGE_TIMESTAMP_FIELD[dto.status];

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          ...(timestampField ? { [timestampField]: new Date() } : {}),
          ...(dto.status === OrderStatus.CANCELLED
            ? {
                cancelReason: dto.reason,
                cancelNote: dto.note,
                cancelledAt: new Date(),
              }
            : {}),
        },
        select: { id: true, status: true, updatedAt: true },
      });

      if (dto.status === OrderStatus.DELIVERED) {
        await this.inventory.commitSale(tx, id);

        if (existing.status !== OrderStatus.DELIVERED && existing.customerId) {
          const loyalty = await tx.store.findUnique({
            where: { id: storeId },
            select: {
              loyaltyPointsEnabled: true,
              pointsPerDeliveredOrder: true,
            },
          });
          if (loyalty?.loyaltyPointsEnabled) {
            const award = await tx.loyaltyPointTransaction.createMany({
              data: [
                {
                  storeId,
                  customerId: existing.customerId,
                  orderId: id,
                  points: loyalty.pointsPerDeliveredOrder,
                  type: 'EARNED',
                },
              ],
              skipDuplicates: true,
            });
            if (award.count === 1) {
              await tx.user.update({
                where: { id: existing.customerId },
                data: {
                  loyaltyPoints: { increment: loyalty.pointsPerDeliveredOrder },
                },
              });
            }
          }
        }
      } else if (dto.status === OrderStatus.CANCELLED) {
        await this.inventory.releaseReservation(tx, id);
        if (existing.customerId && existing.pointsRedeemed > 0) {
          const restored = await tx.loyaltyPointTransaction.createMany({
            data: [
              {
                storeId,
                customerId: existing.customerId,
                orderId: id,
                points: existing.pointsRedeemed,
                type: 'RESTORED',
              },
            ],
            skipDuplicates: true,
          });
          if (restored.count === 1) {
            await tx.user.update({
              where: { id: existing.customerId },
              data: { loyaltyPoints: { increment: existing.pointsRedeemed } },
            });
          }
        }
      }

      await this.logActivity(tx, {
        orderId: id,
        storeId,
        type:
          dto.status === OrderStatus.CANCELLED
            ? OrderActivityType.CANCELLED
            : OrderActivityType.STATUS_CHANGED,
        actorId,
        title: `تغيير حالة الطلب إلى ${dto.status}`,
        description: dto.reason ?? dto.note,
        previousValue: existing.status,
        newValue: dto.status,
      });

      return order;
    });
  }

  async addNote(
    storeId: string,
    orderId: string,
    actorId: string,
    dto: CreateOrderNoteDto,
  ) {
    await this.requireOrder(storeId, orderId);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.orderNote.create({
        data: {
          orderId,
          storeId,
          authorId: actorId,
          content: dto.content,
          pinned: dto.pinned ?? false,
          attachmentUrl: dto.attachmentUrl,
        },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.NOTE_ADDED,
        actorId,
        title: 'إضافة ملاحظة داخلية',
      });
      return note;
    });
  }

  async updateNote(
    storeId: string,
    orderId: string,
    noteId: string,
    actorId: string,
    dto: UpdateOrderNoteDto,
  ) {
    await this.requireOrder(storeId, orderId);
    const note = await this.prisma.orderNote.findFirst({
      where: { id: noteId, orderId, storeId },
    });
    if (!note) throw new NotFoundException('الملاحظة غير موجودة');
    if (note.authorId !== actorId) {
      throw new ForbiddenException('يمكنك تعديل ملاحظاتك فقط');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.orderNote.update({
        where: { id: noteId },
        data: {
          ...(dto.content !== undefined ? { content: dto.content } : {}),
          ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
          editedAt: new Date(),
        },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.NOTE_UPDATED,
        actorId,
        title: 'تعديل ملاحظة داخلية',
      });
      return updated;
    });
  }

  async deleteNote(
    storeId: string,
    orderId: string,
    noteId: string,
    actorId: string,
  ) {
    await this.requireOrder(storeId, orderId);
    const note = await this.prisma.orderNote.findFirst({
      where: { id: noteId, orderId, storeId },
    });
    if (!note) throw new NotFoundException('الملاحظة غير موجودة');
    if (note.authorId !== actorId) {
      throw new ForbiddenException('يمكنك حذف ملاحظاتك فقط');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.orderNote.delete({ where: { id: noteId } });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.NOTE_DELETED,
        actorId,
        title: 'حذف ملاحظة داخلية',
      });
      return { success: true };
    });
  }

  async assignDriver(
    storeId: string,
    orderId: string,
    actorId: string,
    dto: AssignDriverDto,
  ) {
    const existing = await this.requireOrder(storeId, orderId);
    if (existing.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('لا يمكن تعيين سائق لطلب ملغى');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          driverName: dto.driverName,
          driverPhone: dto.driverPhone,
          trackingNumber: dto.trackingNumber,
          estimatedDeliveryAt: dto.estimatedDeliveryAt
            ? new Date(dto.estimatedDeliveryAt)
            : undefined,
        },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.DRIVER_ASSIGNED,
        actorId,
        title: `تعيين السائق ${dto.driverName}`,
        previousValue: existing.driverName ?? undefined,
        newValue: dto.driverName,
      });
      return order;
    });
  }

  async markPickedUp(storeId: string, orderId: string, actorId: string) {
    await this.requireOrder(storeId, orderId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: { pickedUpAt: new Date() },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.STATUS_CHANGED,
        actorId,
        title: 'استلام السائق للطلب',
      });
      return order;
    });
  }

  async reportDeliveryFailure(
    storeId: string,
    orderId: string,
    actorId: string,
    dto: ReportDeliveryFailureDto,
  ) {
    await this.requireOrder(storeId, orderId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          deliveryFailedAt: new Date(),
          deliveryFailureReason: dto.reason,
        },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.STATUS_CHANGED,
        actorId,
        title: 'فشل التوصيل',
        description: dto.reason,
      });
      return order;
    });
  }

  async updatePayment(
    storeId: string,
    orderId: string,
    actorId: string,
    dto: UpdatePaymentDto,
  ) {
    const existing = await this.requireOrder(storeId, orderId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: dto.paymentStatus,
          paidAmount: dto.paidAmount,
          paymentReference: dto.paymentReference,
          paymentProofUrl: dto.paymentProofUrl,
          paymentCollectedById: actorId,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.PAYMENT_UPDATED,
        actorId,
        title: 'تحديث حالة الدفع',
        previousValue: existing.paymentStatus,
        newValue: dto.paymentStatus,
      });
      return order;
    });
  }

  async createReturn(
    storeId: string,
    orderId: string,
    actorId: string,
    dto: CreateReturnDto,
  ) {
    const order = await this.requireOrder(storeId, orderId);
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('يمكن إنشاء طلب إرجاع فقط بعد تسليم الطلب');
    }
    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId, id: { in: dto.items.map((i) => i.orderItemId) } },
    });
    if (orderItems.length !== dto.items.length) {
      throw new BadRequestException('بعض عناصر الطلب غير صالحة');
    }

    return this.prisma.$transaction(async (tx) => {
      const ret = await tx.return.create({
        data: {
          orderId,
          storeId,
          reason: dto.reason,
          customerDescription: dto.customerDescription,
          items: {
            create: dto.items.map((i) => ({
              orderItemId: i.orderItemId,
              requestedQty: i.requestedQty,
            })),
          },
          images: dto.imageUrls
            ? { create: dto.imageUrls.map((url) => ({ url })) }
            : undefined,
        },
        include: { items: true, images: true },
      });
      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.RETURN_REQUESTED,
        actorId,
        title: 'إنشاء طلب إرجاع',
        description: dto.reason,
      });
      return ret;
    });
  }

  async updateReturn(
    storeId: string,
    orderId: string,
    returnId: string,
    actorId: string,
    dto: UpdateReturnDto,
  ) {
    await this.requireOrder(storeId, orderId);
    const ret = await this.prisma.return.findFirst({
      where: { id: returnId, orderId, storeId },
      include: { items: { include: { orderItem: true } } },
    });
    if (!ret) throw new NotFoundException('طلب الإرجاع غير موجود');

    return this.prisma.$transaction(async (tx) => {
      if (dto.items?.length) {
        for (const itemUpdate of dto.items) {
          const current = ret.items.find((i) => i.id === itemUpdate.id);
          if (!current) continue;
          await tx.returnItem.update({
            where: { id: itemUpdate.id },
            data: {
              ...(itemUpdate.approvedQty !== undefined
                ? { approvedQty: itemUpdate.approvedQty }
                : {}),
              ...(itemUpdate.condition !== undefined
                ? { condition: itemUpdate.condition }
                : {}),
              ...(itemUpdate.restockDecision !== undefined
                ? { restockDecision: itemUpdate.restockDecision }
                : {}),
            },
          });

          // Restocking is an explicit, one-time action: only fires the
          // moment a restock decision transitions away from NONE, and never
          // happens automatically off a refund.
          const decisionChanged =
            itemUpdate.restockDecision &&
            itemUpdate.restockDecision !== current.restockDecision &&
            current.restockDecision === RestockDecision.NONE;
          if (decisionChanged && current.orderItem.productId) {
            const qty = itemUpdate.approvedQty ?? current.requestedQty;
            if (
              itemUpdate.restockDecision === RestockDecision.RESTOCK_AVAILABLE
            ) {
              await this.inventory.adjustStock(tx, {
                storeId,
                productId: current.orderItem.productId,
                quantity: qty,
                type: 'RETURN_TO_STOCK',
                reason: 'إرجاع عميل — إعادة للمخزون المتاح',
                relatedOrderId: orderId,
              });
            } else if (
              itemUpdate.restockDecision === RestockDecision.RESTOCK_DAMAGED
            ) {
              await this.inventory.adjustStock(tx, {
                storeId,
                productId: current.orderItem.productId,
                quantity: qty,
                type: 'DAMAGED_RETURN',
                reason: 'إرجاع عميل — تالف',
                relatedOrderId: orderId,
              });
            }
            if (
              itemUpdate.restockDecision ===
                RestockDecision.RESTOCK_AVAILABLE ||
              itemUpdate.restockDecision === RestockDecision.RESTOCK_DAMAGED
            ) {
              await this.logActivity(tx, {
                orderId,
                storeId,
                type: OrderActivityType.RESTOCKED,
                actorId,
                title: 'إعادة تخزين منتج مرتجع',
                newValue: itemUpdate.restockDecision,
              });
            }
          }
        }
      }

      const updated = await tx.return.update({
        where: { id: returnId },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
        include: { items: true, images: true },
      });

      if (dto.status && dto.status !== ret.status) {
        await this.logActivity(tx, {
          orderId,
          storeId,
          type: OrderActivityType.RETURN_STATUS_CHANGED,
          actorId,
          title: `تحديث حالة الإرجاع إلى ${dto.status}`,
          previousValue: ret.status,
          newValue: dto.status,
        });
      }

      return updated;
    });
  }

  async createRefund(
    storeId: string,
    orderId: string,
    actorId: string,
    dto: CreateRefundDto,
  ) {
    const order = await this.requireOrder(storeId, orderId);
    if (dto.returnId) {
      const ret = await this.prisma.return.findFirst({
        where: { id: dto.returnId, orderId, storeId },
      });
      if (!ret) throw new NotFoundException('طلب الإرجاع غير موجود');
    }

    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          orderId,
          returnId: dto.returnId,
          storeId,
          amount: dto.amount,
          method: dto.method,
          status: 'COMPLETED',
          processedById: actorId,
          processedAt: new Date(),
        },
      });

      const completedRefunds = await tx.refund.aggregate({
        where: { orderId, status: 'COMPLETED' },
        _sum: { amount: true },
      });
      const totalRefunded = Number(completedRefunds._sum.amount ?? 0);
      const newPaymentStatus =
        totalRefunded >= Number(order.paidAmount)
          ? 'REFUNDED'
          : 'PARTIALLY_REFUNDED';
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: newPaymentStatus },
      });

      await this.logActivity(tx, {
        orderId,
        storeId,
        type: OrderActivityType.REFUND_PROCESSED,
        actorId,
        title: 'معالجة استرداد',
        newValue: String(dto.amount),
      });

      return refund;
    });
  }

  async getInvoice(storeId: string, orderId: string) {
    return this.get(storeId, orderId);
  }
}
