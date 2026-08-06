import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailQueueService } from '../mail/email-queue.service';
import {
  receiptEmailAr,
  receiptEmailEn,
  statusChangeEmail,
} from '../mail/email-templates';
import { ApplicationStatus, Prisma } from '../../generated/prisma';
import {
  shippingInfoSchema,
  storeInfoSchema,
} from './dto/store-applications.schemas';
import type {
  AddDocumentBodyDto,
  ListApplicationsQueryDto,
  PatchApplicationDto,
  RejectApplicationDto,
  RequestChangesDto,
  SuspendApplicationDto,
} from './dto/store-applications.schemas';
import type { StoredFile } from '../storage/storage.interface';

const EDITABLE_STATUSES: ApplicationStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];

/**
 * Documents that must be on file before an application can be submitted.
 * Mirrored in the frontend wizard (applicationValidation.ts) — keep in sync.
 */
const REQUIRED_DOCUMENT_TYPES: Record<string, string[]> = {
  PHYSICAL_STORE_OWNER: ['identity', 'commercial_registration'],
  ONLINE_SELLER: ['identity'],
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  identity: 'الهوية الشخصية',
  commercial_registration: 'السجل التجاري',
  tax_number: 'الرقم الضريبي',
  business_license: 'رخصة العمل',
};

@Injectable()
export class StoreApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emailQueue: EmailQueueService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------
  // Merchant-facing
  // ---------------------------------------------------------------------

  async getOwnApplication(userId: string) {
    const application = await this.findByUser(userId);
    return this.serialize(application);
  }

  async getOwnStatus(userId: string) {
    const application = await this.findByUser(userId);
    return {
      status: application.status,
      currentStep: application.currentStep,
      completionPercentage: application.completionPercentage,
      publicMessage: application.publicMessage,
      requestedChangeFields: application.requestedChangeFields,
      rejectionReason: application.rejectionReason,
      submittedAt: application.submittedAt,
    };
  }

  async patchOwnApplication(userId: string, dto: PatchApplicationDto) {
    const application = await this.findByUser(userId);
    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw new ConflictException({
        code: 'APPLICATION_NOT_EDITABLE',
        message: 'لا يمكن تعديل الطلب في حالته الحالية',
      });
    }

    const merged: Prisma.StoreApplicationUpdateInput = {};
    if (dto.currentStep) merged.currentStep = dto.currentStep;
    if (dto.accountInfo) {
      merged.accountInfo = {
        ...(application.accountInfo as object),
        ...dto.accountInfo,
      };
    }
    if (dto.storeInfo) {
      merged.storeInfo = {
        ...(application.storeInfo as object),
        ...dto.storeInfo,
      };
    }
    if (dto.businessInfo) {
      merged.businessInfo = {
        ...(application.businessInfo as object),
        ...dto.businessInfo,
      } as Prisma.InputJsonValue;
    }
    if (dto.shippingInfo) {
      merged.shippingInfo = {
        ...(application.shippingInfo as object),
        ...dto.shippingInfo,
      };
    }

    const updated = await this.prisma.storeApplication.update({
      where: { id: application.id },
      data: merged,
    });

    const withPercentage = await this.prisma.storeApplication.update({
      where: { id: updated.id },
      data: { completionPercentage: this.computeCompletion(updated) },
    });

    return this.serialize(withPercentage);
  }

  async submit(userId: string) {
    const application = await this.findByUser(userId);
    if (!['DRAFT'].includes(application.status)) {
      throw new ConflictException({
        code: 'ALREADY_SUBMITTED',
        message: 'الطلب مُرسل بالفعل وبانتظار المراجعة',
      });
    }
    this.ensureCompleteForSubmission(application);
    return this.doSubmit(application, userId);
  }

  async resubmit(userId: string) {
    const application = await this.findByUser(userId);
    if (application.status !== 'CHANGES_REQUESTED') {
      throw new ConflictException({
        code: 'NOT_AWAITING_RESUBMISSION',
        message: 'لا يوجد تعديلات مطلوبة على هذا الطلب',
      });
    }
    this.ensureCompleteForSubmission(application);
    return this.doSubmit(application, userId);
  }

  private async doSubmit(
    application: Awaited<ReturnType<StoreApplicationsService['findByUser']>>,
    userId: string,
  ) {
    const wasChangesRequested = application.status === 'CHANGES_REQUESTED';
    const nextVersion = application.submissionVersion + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.storeApplication.update({
        where: { id: application.id },
        data: {
          status: ApplicationStatus.SUBMITTED,
          submittedAt: new Date(),
          submissionVersion: nextVersion,
          publicMessage: wasChangesRequested ? application.publicMessage : null,
          requestedChangeFields: wasChangesRequested
            ? []
            : application.requestedChangeFields,
        },
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.SUBMITTED,
          actorUserId: userId,
          note: wasChangesRequested
            ? 'إعادة إرسال بعد طلب تعديلات'
            : 'تم إرسال الطلب',
        },
      });
      return app;
    });

    await this.notifications.create({
      userId,
      type: 'application_submitted',
      title: 'تم إرسال طلب متجرك',
      body: 'تم استلام طلبك بنجاح وهو الآن بانتظار المراجعة.',
    });

    await this.queueApplicationEmail(updated, 'store-application-received');

    return this.serialize(updated);
  }

  async cancelOwnApplication(userId: string) {
    const application = await this.findByUser(userId);
    if (application.status === ApplicationStatus.APPROVED) {
      throw new ConflictException({
        code: 'APPLICATION_NOT_CANCELABLE',
        message: 'لا يمكن إلغاء الطلب بعد الموافقة على المتجر وتفعيله',
      });
    }

    // Deletes the whole registration (user, store, application) so the
    // person can register again from scratch. Documents/history cascade
    // via the schema; email logs don't, so they're cleared explicitly.
    await this.prisma.$transaction(async (tx) => {
      await tx.emailLog.deleteMany({
        where: { applicationId: application.id },
      });
      await tx.storeApplication.delete({ where: { id: application.id } });
      await tx.store.delete({ where: { id: application.storeId } });
      await tx.user.delete({ where: { id: userId } });
    });

    return { canceled: true };
  }

  async addDocument(userId: string, dto: AddDocumentBodyDto, file: StoredFile) {
    const application = await this.findByUser(userId);
    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw new ConflictException({
        code: 'APPLICATION_NOT_EDITABLE',
        message: 'لا يمكن إضافة مستندات في حالة الطلب الحالية',
      });
    }
    return this.prisma.applicationDocument.create({
      data: {
        applicationId: application.id,
        type: dto.type,
        url: file.url,
        publicId: file.publicId ?? null,
        identityNumber: dto.identityNumber,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        status: 'PENDING_REVIEW',
      },
    });
  }

  async removeDocument(userId: string, documentId: string) {
    const application = await this.findByUser(userId);
    const document = await this.prisma.applicationDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.applicationId !== application.id) {
      throw new NotFoundException('المستند غير موجود');
    }
    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw new ConflictException({
        code: 'APPLICATION_NOT_EDITABLE',
        message: 'لا يمكن حذف مستندات في حالة الطلب الحالية',
      });
    }
    await this.prisma.applicationDocument.delete({ where: { id: documentId } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------
  // Admin-facing
  // ---------------------------------------------------------------------

  async listForAdmin(query: ListApplicationsQueryDto) {
    const where: Prisma.StoreApplicationWhereInput = {};
    if (query.status) where.status = query.status as ApplicationStatus;
    if (query.merchantType) where.merchantType = query.merchantType as never;
    if (query.search) {
      where.OR = [
        { store: { name: { contains: query.search, mode: 'insensitive' } } },
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { user: { phone: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const applications = await this.prisma.storeApplication.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        store: { select: { name: true, slug: true, status: true } },
        _count: { select: { documents: true } },
      },
    });

    return applications.map((app) => ({
      id: app.id,
      merchantType: app.merchantType,
      status: app.status,
      currentStep: app.currentStep,
      completionPercentage: app.completionPercentage,
      submittedAt: app.submittedAt,
      updatedAt: app.updatedAt,
      merchant: app.user,
      store: app.store,
      documentCount: app._count.documents,
      category:
        (app.storeInfo as { category?: string } | null)?.category ?? null,
      country:
        (app.accountInfo as { country?: string } | null)?.country ?? null,
      city: (app.accountInfo as { city?: string } | null)?.city ?? null,
    }));
  }

  async getForAdmin(id: string) {
    const application = await this.prisma.storeApplication.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        store: { select: { id: true, name: true, slug: true, status: true } },
        documents: true,
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!application) throw new NotFoundException('الطلب غير موجود');
    return application;
  }

  async getHistory(id: string) {
    await this.ensureApplicationExists(id);
    return this.prisma.applicationStatusHistory.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async startReview(id: string, adminId: string) {
    const application = await this.ensureApplicationExists(id);
    if (!['SUBMITTED'].includes(application.status)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'لا يمكن بدء المراجعة إلا لطلب تم إرساله',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.storeApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.UNDER_REVIEW,
          reviewStartedAt: new Date(),
          reviewedByUserId: adminId,
        },
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.UNDER_REVIEW,
          actorUserId: adminId,
        },
      });
      return app;
    });

    await this.notifyStatusChange(
      updated,
      'review_started',
      'بدأت مراجعة طلب متجرك',
    );
    return this.serialize(updated);
  }

  async approve(id: string, adminId: string) {
    const application = await this.ensureApplicationExists(id);
    if (application.status === ApplicationStatus.APPROVED) {
      throw new ConflictException({
        code: 'ALREADY_APPROVED',
        message: 'تمت الموافقة على هذا الطلب مسبقاً',
      });
    }
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'لا يمكن الموافقة على الطلب في حالته الحالية',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.storeApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.APPROVED,
          approvedAt: new Date(),
          reviewedByUserId: adminId,
        },
      });
      // Activating Store.status is what unlocks the merchant's dashboard —
      // the existing StoreStatusGuard/RequireActiveStore pattern is what
      // this project uses in place of a separate "store_owner" role.
      await tx.store.update({
        where: { id: application.storeId },
        data: {
          status: 'ACTIVE',
          statusNote: null,
          ...this.buildStorePublicConfigFromApplication(application),
        },
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.APPROVED,
          actorUserId: adminId,
        },
      });
      return app;
    });

    await this.notifyStatusChange(
      updated,
      'application_approved',
      'تمت الموافقة على متجرك وتم تفعيله!',
    );
    return this.serialize(updated);
  }

  async requestChanges(id: string, adminId: string, dto: RequestChangesDto) {
    const application = await this.ensureApplicationExists(id);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'لا يمكن طلب تعديلات في حالة الطلب الحالية',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.storeApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.CHANGES_REQUESTED,
          publicMessage: dto.message,
          requestedChangeFields: dto.fields,
        },
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.CHANGES_REQUESTED,
          actorUserId: adminId,
          note: dto.message,
        },
      });
      return app;
    });

    await this.notifyStatusChange(updated, 'changes_requested', dto.message);
    return this.serialize(updated);
  }

  async reject(id: string, adminId: string, dto: RejectApplicationDto) {
    const application = await this.ensureApplicationExists(id);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'لا يمكن رفض الطلب في حالته الحالية',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.storeApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.reason,
          reviewedByUserId: adminId,
        },
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.REJECTED,
          actorUserId: adminId,
          note: dto.reason,
        },
      });
      return app;
    });

    await this.notifyStatusChange(updated, 'application_rejected', dto.reason);
    return this.serialize(updated);
  }

  async suspend(id: string, adminId: string, dto: SuspendApplicationDto) {
    const application = await this.ensureApplicationExists(id);
    if (application.status === ApplicationStatus.SUSPENDED) {
      throw new ConflictException({
        code: 'ALREADY_SUSPENDED',
        message: 'الطلب موقوف بالفعل',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.storeApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.SUSPENDED,
          rejectionReason: dto.reason,
        },
      });
      if (application.status === ApplicationStatus.APPROVED) {
        await tx.store.update({
          where: { id: application.storeId },
          data: { status: 'SUSPENDED', statusNote: dto.reason },
        });
      }
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.SUSPENDED,
          actorUserId: adminId,
          note: dto.reason,
        },
      });
      return app;
    });

    await this.notifyStatusChange(updated, 'application_suspended', dto.reason);
    return this.serialize(updated);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async findByUser(userId: string) {
    const application = await this.prisma.storeApplication.findUnique({
      where: { userId },
      include: { documents: true },
    });
    if (!application) {
      throw new NotFoundException('لا يوجد طلب متجر مرتبط بحسابك');
    }
    return application;
  }

  // Copies the onboarding data captured in storeInfo/shippingInfo (loose
  // JSON blobs filled in during the application wizard) onto the first-class
  // Store columns the public storefront reads from — this is the one place
  // that data ever reaches the customer-facing side.
  private buildStorePublicConfigFromApplication(application: {
    storeInfo: Prisma.JsonValue;
    shippingInfo: Prisma.JsonValue;
  }): Prisma.StoreUpdateInput {
    const storeInfo = storeInfoSchema
      .partial()
      .safeParse(application.storeInfo ?? {});
    const shippingInfo = shippingInfoSchema
      .partial()
      .safeParse(application.shippingInfo ?? {});

    const data: Prisma.StoreUpdateInput = {};

    if (storeInfo.success) {
      const info = storeInfo.data;
      if (info.socialLinks) data.socialLinks = info.socialLinks;
      if (info.csPhone) data.contactPhone = info.csPhone;
      if (info.csWhatsapp) data.contactWhatsapp = info.csWhatsapp;
      if (info.publicEmail) data.publicEmail = info.publicEmail;
      if (info.currency) data.currency = info.currency;
    }

    if (shippingInfo.success) {
      const info = shippingInfo.data;
      if (info.returnPolicy) data.returnPolicy = info.returnPolicy;
      if (info.shippingPolicy) data.shippingPolicy = info.shippingPolicy;
      if (info.codAvailable !== undefined)
        data.codAvailable = info.codAvailable;
      if (info.bankTransferAvailable !== undefined) {
        data.bankTransferAvailable = info.bankTransferAvailable;
      }
    }

    return data;
  }

  private async ensureApplicationExists(id: string) {
    const application = await this.prisma.storeApplication.findUnique({
      where: { id },
    });
    if (!application) throw new NotFoundException('الطلب غير موجود');
    return application;
  }

  private computeCompletion(app: {
    accountInfo: unknown;
    storeInfo: unknown;
    businessInfo: unknown;
    shippingInfo: unknown;
  }): number {
    const sections = [
      app.accountInfo,
      app.storeInfo,
      app.businessInfo,
      app.shippingInfo,
    ];
    const filled = sections.filter(
      (s) => s && typeof s === 'object' && Object.keys(s).length > 0,
    ).length;
    return Math.round((filled / sections.length) * 100);
  }

  private ensureCompleteForSubmission(application: {
    merchantType: string;
    accountInfo: unknown;
    storeInfo: unknown;
    businessInfo: unknown;
    shippingInfo: unknown;
    documents: { type: string }[];
  }) {
    const account = (application.accountInfo ?? {}) as Record<string, unknown>;
    const store = (application.storeInfo ?? {}) as Record<string, unknown>;
    const business = (application.businessInfo ?? {}) as Record<
      string,
      unknown
    >;
    const shipping = (application.shippingInfo ?? {}) as Record<
      string,
      unknown
    >;

    const missing: string[] = [];
    const blank = (v: unknown) =>
      v === undefined || v === null || (typeof v === 'string' && !v.trim());
    const require = (v: unknown, label: string) => {
      if (blank(v)) missing.push(label);
    };

    // Step 1 — account
    require(account.whatsapp, 'رقم الواتساب');
    require(account.country, 'الدولة');
    require(account.city, 'المدينة');
    require(account.preferredContactMethod, 'وسيلة التواصل المفضلة');
    if (!account.termsAccepted) missing.push('الموافقة على الشروط والأحكام');
    if (!account.privacyAccepted) missing.push('الموافقة على سياسة الخصوصية');

    // Step 2 — store
    require(store.nameAr, 'اسم المتجر بالعربية');
    require(store.category, 'التصنيف التجاري');
    require(store.description, 'وصف المتجر');
    require(store.csPhone, 'رقم هاتف خدمة العملاء');
    require(store.currency, 'العملة');

    // Step 3 — business activity (fields differ per merchant type)
    if (application.merchantType === 'PHYSICAL_STORE_OWNER') {
      require(business.legalBusinessName, 'الاسم التجاري القانوني');
      require(business.physicalStoreName, 'اسم المتجر الفعلي');
      require(business.mainBranchAddress, 'عنوان الفرع الرئيسي');
      require(business.openingTime, 'وقت الفتح');
      require(business.closingTime, 'وقت الإغلاق');
      if (blank(business.branchCount) || Number(business.branchCount) < 1) {
        missing.push('عدد الفروع');
      }
    } else {
      require(business.sellingModel, 'نموذج البيع');
      require(business.productSource, 'مصدر المنتجات');
      require(business.avgOrderPrepTime, 'متوسط زمن تجهيز الطلب');
    }

    // Step 4 — shipping. Pickup-only stores are exempt from the delivery
    // fee / delivery time, which don't apply to them.
    require(shipping.deliveryMethod, 'طريقة التوصيل');
    require(shipping.avgPrepTime, 'متوسط وقت التجهيز');
    require(shipping.returnPolicy, 'سياسة الاستبدال والاسترجاع');
    require(shipping.shippingPolicy, 'سياسة الشحن');
    if (shipping.deliveryMethod !== 'store_pickup') {
      require(shipping.deliveryFee, 'تكلفة التوصيل');
      require(shipping.avgDeliveryTime, 'متوسط وقت التوصيل');
    }

    // Step 5 — mandatory documents
    const uploaded = new Set(application.documents.map((d) => d.type));
    for (const type of REQUIRED_DOCUMENT_TYPES[application.merchantType] ??
      REQUIRED_DOCUMENT_TYPES.ONLINE_SELLER) {
      if (!uploaded.has(type)) missing.push(DOCUMENT_TYPE_LABELS[type] ?? type);
    }

    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'الطلب غير مكتمل، الرجاء استكمال الحقول المطلوبة',
        missingFields: missing,
      });
    }
  }

  private serialize(application: {
    id: string;
    status: ApplicationStatus;
    merchantType: string;
    currentStep: number;
    completionPercentage: number;
    accountInfo: unknown;
    storeInfo: unknown;
    businessInfo: unknown;
    shippingInfo: unknown;
    publicMessage: string | null;
    requestedChangeFields: string[];
    rejectionReason: string | null;
    submittedAt: Date | null;
    documents?: unknown;
  }) {
    return application;
  }

  private async notifyStatusChange(
    application: Awaited<
      ReturnType<StoreApplicationsService['ensureApplicationExists']>
    >,
    type: string,
    message: string,
  ) {
    const full = await this.prisma.storeApplication.findUniqueOrThrow({
      where: { id: application.id },
      include: { user: true, store: true },
    });

    await this.notifications.create({
      userId: full.userId,
      type,
      title: this.titleForType(type),
      body: message,
    });

    await this.queueApplicationEmail(full, type);
  }

  private titleForType(type: string) {
    const map: Record<string, string> = {
      review_started: 'بدأت مراجعة طلبك',
      changes_requested: 'مطلوب تعديلات على طلبك',
      application_approved: 'تمت الموافقة على متجرك',
      application_rejected: 'تم رفض طلبك',
      application_suspended: 'تم إيقاف طلبك',
    };
    return map[type] ?? 'تحديث على طلب متجرك';
  }

  private async queueApplicationEmail(
    application: {
      id: string;
      status: ApplicationStatus;
      submissionVersion: number;
      accountInfo: unknown;
      userId: string;
    },
    type: string,
  ) {
    const full = await this.prisma.storeApplication.findUniqueOrThrow({
      where: { id: application.id },
      include: { user: true, store: true },
    });
    if (!full.user.email) return;

    const lang = ((full.accountInfo as { preferredLanguage?: string } | null)
      ?.preferredLanguage ?? 'ar') as 'ar' | 'en';
    const statusPageUrl = `${this.config.get<string>('frontendBaseUrl')}/merchant/application-status`;
    const templateData = {
      merchantName: full.user.name,
      storeName: full.store.name,
      applicationReference: full.id.slice(0, 8).toUpperCase(),
      statusPageUrl,
    };

    const template =
      type === 'store-application-received'
        ? lang === 'ar'
          ? receiptEmailAr(templateData)
          : receiptEmailEn(templateData)
        : statusChangeEmail(lang, full.status, templateData);

    await this.emailQueue.enqueue({
      idempotencyKey: `${type}:${full.id}:${full.submissionVersion}`,
      type,
      applicationId: full.id,
      submissionVersion: full.submissionVersion,
      storeId: full.storeId,
      recipientUserId: full.userId,
      recipientEmail: full.user.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }
}
