import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StoreApplicationsService } from './store-applications.service';

function buildApplication(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'app-1',
    userId: 'user-1',
    storeId: 'store-1',
    merchantType: 'ONLINE_SELLER',
    status: 'DRAFT',
    submissionVersion: 0,
    accountInfo: {
      whatsapp: '0911111111',
      country: 'سوريا',
      city: 'دمشق',
      preferredContactMethod: 'whatsapp',
      termsAccepted: true,
      privacyAccepted: true,
    },
    storeInfo: {
      nameAr: 'متجري',
      category: 'ملابس',
      description: 'متجر ملابس',
      csPhone: '0911111111',
      currency: 'SYP',
    },
    businessInfo: {
      sellingModel: 'own_products',
      productSource: 'مورد محلي',
      avgOrderPrepTime: 'يوم واحد',
    },
    shippingInfo: {
      deliveryMethod: 'shipping_company',
      deliveryFee: 5000,
      avgPrepTime: 'يوم واحد',
      avgDeliveryTime: 'يومان',
      returnPolicy: 'استرجاع خلال 3 أيام',
      shippingPolicy: 'شحن لكل المحافظات',
    },
    publicMessage: null,
    requestedChangeFields: [],
    documents: [{ type: 'identity' }],
    ...overrides,
  };
}

describe('StoreApplicationsService', () => {
  let prisma: {
    storeApplication: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let notifications: { create: jest.Mock };
  let emailQueue: { enqueue: jest.Mock };
  let config: { get: jest.Mock };
  let service: StoreApplicationsService;

  beforeEach(() => {
    prisma = {
      storeApplication: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          storeApplication: {
            update: jest.fn((args) => ({ ...args.data, id: 'app-1' })),
          },
          store: { update: jest.fn() },
          applicationStatusHistory: { create: jest.fn() },
        }),
      ),
    };
    notifications = { create: jest.fn() };
    emailQueue = { enqueue: jest.fn() };
    config = { get: jest.fn(() => 'http://localhost:5173') };

    service = new StoreApplicationsService(
      prisma as never,
      notifications as never,
      emailQueue as never,
      config as never,
    );

    prisma.storeApplication.findUniqueOrThrow.mockResolvedValue({
      ...buildApplication({ status: 'SUBMITTED', submissionVersion: 1 }),
      user: { name: 'تاجر', email: 'merchant@test.com' },
      store: { name: 'متجري' },
    });
  });

  describe('submit', () => {
    it('rejects submission when required fields are missing', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({
          storeInfo: null,
          businessInfo: null,
          shippingInfo: null,
        }),
      );
      await expect(service.submit('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('submits a complete draft application and queues the receipt email', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(buildApplication());
      const result = await service.submit('user-1');
      expect(result).toBeDefined();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'application_submitted' }),
      );
      expect(emailQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'store-application-received',
          idempotencyKey: 'store-application-received:app-1:1',
        }),
      );
    });

    it('rejects submission when a mandatory document is missing', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ documents: [] }),
      );
      await expect(service.submit('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('requires the commercial registration from physical store owners', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({
          merchantType: 'PHYSICAL_STORE_OWNER',
          businessInfo: {
            legalBusinessName: 'شركة النور',
            physicalStoreName: 'متجر النور',
            branchCount: 1,
            mainBranchAddress: 'دمشق - الشعلان',
            openingTime: '09:00',
            closingTime: '21:00',
          },
          documents: [{ type: 'identity' }],
        }),
      );
      await expect(service.submit('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('blocks duplicate submission when already submitted', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ status: 'SUBMITTED' }),
      );
      await expect(service.submit('user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('approve', () => {
    it('approves a submitted application and activates the store', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ status: 'SUBMITTED' }),
      );
      await service.approve('app-1', 'admin-1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'application_approved' }),
      );
      expect(emailQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'application_approved' }),
      );
    });

    it('prevents duplicate approval of an already-approved application', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ status: 'APPROVED' }),
      );
      await expect(service.approve('app-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException for an unknown application id', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(null);
      await expect(service.approve('missing', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('requestChanges', () => {
    it('moves a submitted application to CHANGES_REQUESTED with the reviewer message', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ status: 'UNDER_REVIEW' }),
      );
      await service.requestChanges('app-1', 'admin-1', {
        message: 'الرجاء توضيح رقم السجل التجاري',
        fields: ['businessInfo.legalBusinessName'],
      });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'changes_requested' }),
      );
    });
  });

  describe('resubmit', () => {
    it('rejects resubmission when the application is not awaiting changes', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ status: 'DRAFT' }),
      );
      await expect(service.resubmit('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('bumps the submission version on resubmit', async () => {
      prisma.storeApplication.findUnique.mockResolvedValue(
        buildApplication({ status: 'CHANGES_REQUESTED', submissionVersion: 1 }),
      );
      prisma.storeApplication.findUniqueOrThrow.mockResolvedValueOnce({
        ...buildApplication({ status: 'SUBMITTED', submissionVersion: 2 }),
        user: { name: 'تاجر', email: 'merchant@test.com' },
        store: { name: 'متجري' },
      });
      await service.resubmit('user-1');
      expect(emailQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'store-application-received:app-1:2',
        }),
      );
    });
  });
});
