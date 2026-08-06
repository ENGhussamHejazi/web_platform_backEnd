import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { OrdersService } from './orders.service';
import { InventoryService } from '../inventory/inventory.service';
import { mailStub } from '../mail/testing/mail-stub';

function buildOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    storeId: 'store-1',
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    paidAmount: new Prisma.Decimal(0),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    driverName: null,
    ...overrides,
  };
}

describe('OrdersService', () => {
  let prisma: any;
  let inventory: {
    commitSale: jest.Mock;
    releaseReservation: jest.Mock;
    adjustStock: jest.Mock;
  };
  let service: OrdersService;
  let tx: any;
  let mail: ReturnType<typeof mailStub>;

  beforeEach(() => {
    tx = {
      order: { update: jest.fn().mockResolvedValue(buildOrder()) },
      orderActivity: { create: jest.fn() },
      store: { findUnique: jest.fn() },
      loyaltyPointTransaction: { createMany: jest.fn() },
      user: { update: jest.fn() },
      returnItem: { update: jest.fn() },
      return: {
        update: jest.fn().mockResolvedValue({ items: [], images: [] }),
      },
      refund: {
        create: jest.fn().mockResolvedValue({ id: 'refund-1' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };
    prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(buildOrder()),
      },
      return: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => unknown) => cb(tx)),
    };
    inventory = {
      commitSale: jest.fn(),
      releaseReservation: jest.fn(),
      adjustStock: jest.fn(),
    };
    mail = mailStub();
    service = new OrdersService(
      prisma,
      inventory as unknown as InventoryService,
      mail,
    );
  });

  describe('updateStatus', () => {
    it('rejects cancellation without a reason', async () => {
      await expect(
        service.updateStatus(
          'store-1',
          'order-1',
          { status: 'CANCELLED' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('logs an activity row for every status change', async () => {
      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'CONFIRMED' },
        'user-1',
      );
      expect(tx.orderActivity.create).toHaveBeenCalledTimes(1);
      expect(tx.orderActivity.create.mock.calls[0][0].data).toMatchObject({
        type: 'STATUS_CHANGED',
        previousValue: 'PENDING',
        newValue: 'CONFIRMED',
      });
    });

    it('releases inventory reservations on cancellation', async () => {
      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'CANCELLED', reason: 'العميل غيّر رأيه' },
        'user-1',
      );
      expect(inventory.releaseReservation).toHaveBeenCalledWith(tx, 'order-1');
      expect(inventory.commitSale).not.toHaveBeenCalled();
    });

    it('restores redeemed points once when a discounted order is cancelled', async () => {
      prisma.order.findFirst.mockResolvedValue(
        buildOrder({
          customerId: 'customer-1',
          pointsRedeemed: 20,
        }),
      );
      tx.loyaltyPointTransaction.createMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'CANCELLED', reason: 'طلب العميل' },
        'user-1',
      );

      expect(tx.loyaltyPointTransaction.createMany).toHaveBeenCalledWith({
        data: [
          {
            storeId: 'store-1',
            customerId: 'customer-1',
            orderId: 'order-1',
            points: 20,
            type: 'RESTORED',
          },
        ],
        skipDuplicates: true,
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { loyaltyPoints: { increment: 20 } },
      });
    });

    it('awards configured points once when a customer order is delivered', async () => {
      prisma.order.findFirst.mockResolvedValue(
        buildOrder({ customerId: 'customer-1' }),
      );
      tx.store.findUnique.mockResolvedValue({
        loyaltyPointsEnabled: true,
        pointsPerDeliveredOrder: 7,
      });
      tx.loyaltyPointTransaction.createMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'DELIVERED' },
        'user-1',
      );

      expect(tx.loyaltyPointTransaction.createMany).toHaveBeenCalledWith({
        data: [
          {
            storeId: 'store-1',
            customerId: 'customer-1',
            orderId: 'order-1',
            points: 7,
            type: 'EARNED',
          },
        ],
        skipDuplicates: true,
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { loyaltyPoints: { increment: 7 } },
      });
    });

    it('does not award points when the loyalty feature is disabled', async () => {
      prisma.order.findFirst.mockResolvedValue(
        buildOrder({ customerId: 'customer-1' }),
      );
      tx.store.findUnique.mockResolvedValue({
        loyaltyPointsEnabled: false,
        pointsPerDeliveredOrder: 1,
      });

      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'DELIVERED' },
        'user-1',
      );

      expect(tx.loyaltyPointTransaction.createMany).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('createRefund', () => {
    it('never touches inventory directly', async () => {
      await service.createRefund('store-1', 'order-1', 'user-1', {
        amount: 50,
        method: 'CASH_ON_DELIVERY',
      });
      expect(inventory.adjustStock).not.toHaveBeenCalled();
      expect(tx.refund.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateReturn restock decisions', () => {
    const returnItem = {
      id: 'ri-1',
      requestedQty: 2,
      approvedQty: null,
      restockDecision: 'NONE',
      orderItem: { productId: 'product-1' },
    };

    beforeEach(() => {
      prisma.return.findFirst.mockResolvedValue({
        id: 'return-1',
        status: 'INSPECTING',
        items: [returnItem],
      });
    });

    it('restocks available inventory exactly once when the decision fires', async () => {
      await service.updateReturn('store-1', 'order-1', 'return-1', 'user-1', {
        items: [
          { id: 'ri-1', restockDecision: 'RESTOCK_AVAILABLE', approvedQty: 2 },
        ],
      });
      expect(inventory.adjustStock).toHaveBeenCalledTimes(1);
      expect(inventory.adjustStock).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          type: 'RETURN_TO_STOCK',
          productId: 'product-1',
          quantity: 2,
        }),
      );
    });

    it('does not restock again once a decision was already made', async () => {
      prisma.return.findFirst.mockResolvedValue({
        id: 'return-1',
        status: 'INSPECTING',
        items: [{ ...returnItem, restockDecision: 'RESTOCK_AVAILABLE' }],
      });
      await service.updateReturn('store-1', 'order-1', 'return-1', 'user-1', {
        items: [
          { id: 'ri-1', restockDecision: 'RESTOCK_DAMAGED', approvedQty: 2 },
        ],
      });
      expect(inventory.adjustStock).not.toHaveBeenCalled();
    });
  });

  // Email is fired post-commit and un-awaited; these assert the service asks
  // for the right notification, not what the mail layer then does with it.
  describe('customer notifications', () => {
    it('emails the customer on a real status transition', async () => {
      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'CONFIRMED' },
        'user-1',
      );
      expect(mail.sendOrderStatusUpdate).toHaveBeenCalledWith(
        'order-1',
        'CONFIRMED',
        undefined,
      );
    });

    it('does not email when the status is re-saved unchanged', async () => {
      prisma.order.findFirst.mockResolvedValue(
        buildOrder({ status: 'SHIPPED' }),
      );
      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'SHIPPED' },
        'user-1',
      );
      expect(mail.sendOrderStatusUpdate).not.toHaveBeenCalled();
    });

    it('passes the cancellation reason through to the email', async () => {
      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'CANCELLED', reason: 'نفد المخزون' },
        'user-1',
      );
      expect(mail.sendOrderStatusUpdate).toHaveBeenCalledWith(
        'order-1',
        'CANCELLED',
        'نفد المخزون',
      );
    });

    it('falls back to the note when there is no reason', async () => {
      await service.updateStatus(
        'store-1',
        'order-1',
        { status: 'PROCESSING', note: 'جارٍ التغليف' },
        'user-1',
      );
      expect(mail.sendOrderStatusUpdate).toHaveBeenCalledWith(
        'order-1',
        'PROCESSING',
        'جارٍ التغليف',
      );
    });

    it('does not email before the transaction has run', async () => {
      // If the transaction throws, nothing was committed, so nothing is sent.
      prisma.$transaction.mockRejectedValueOnce(new Error('rollback'));
      await expect(
        service.updateStatus(
          'store-1',
          'order-1',
          { status: 'CONFIRMED' },
          'u',
        ),
      ).rejects.toThrow('rollback');
      expect(mail.sendOrderStatusUpdate).not.toHaveBeenCalled();
    });

    it('emails the customer when a refund is processed', async () => {
      await service.createRefund('store-1', 'order-1', 'user-1', {
        amount: 50,
        method: 'CASH_ON_DELIVERY',
      });
      expect(mail.sendRefundIssued).toHaveBeenCalledWith(
        expect.objectContaining({
          refundId: 'refund-1',
          orderId: 'order-1',
          amount: 50,
          methodLabel: 'نقداً',
        }),
      );
    });

    it('localises the refund method rather than emailing the raw enum', async () => {
      await service.createRefund('store-1', 'order-1', 'user-1', {
        amount: 50,
        method: 'CARD',
      });
      expect(mail.sendRefundIssued.mock.calls[0][0].methodLabel).toBe(
        'إلى البطاقة',
      );
    });

    it('emails the customer when the return status changes', async () => {
      prisma.return.findFirst.mockResolvedValue({
        id: 'return-1',
        status: 'INSPECTING',
        items: [],
      });
      await service.updateReturn('store-1', 'order-1', 'return-1', 'user-1', {
        status: 'APPROVED',
      });
      expect(mail.sendReturnStatusUpdate).toHaveBeenCalledWith({
        returnId: 'return-1',
        orderId: 'order-1',
        status: 'APPROVED',
      });
    });

    it('does not email when a return is edited without a status change', async () => {
      prisma.return.findFirst.mockResolvedValue({
        id: 'return-1',
        status: 'APPROVED',
        items: [],
      });
      await service.updateReturn('store-1', 'order-1', 'return-1', 'user-1', {
        status: 'APPROVED',
      });
      expect(mail.sendReturnStatusUpdate).not.toHaveBeenCalled();
    });
  });
});
