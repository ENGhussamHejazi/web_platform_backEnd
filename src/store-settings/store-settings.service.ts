import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma';
import type {
  AnnouncementDto,
  HomepageSectionDto,
  UpdateAnnouncementDto,
  UpdateHomepageSectionDto,
  ReorderHomepageSectionsDto,
  UpdateStoreSettingsDto,
} from './dto/store-settings.schemas';

const STORE_SETTINGS_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  galleryImages: {
    select: { id: true, url: true, publicId: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  primaryColor: true,
  businessCategories: true,
  socialLinks: true,
  legalLinks: true,
  contactPhone: true,
  contactWhatsapp: true,
  publicEmail: true,
  currency: true,
  usdToSypRate: true,
  returnPolicy: true,
  returnsEnabled: true,
  shippingPolicy: true,
  pickupEnabled: true,
  pickupAddress: true,
  codAvailable: true,
  bankTransferAvailable: true,
  loyaltyPointsEnabled: true,
  pointsPerDeliveredOrder: true,
  pointsRequiredForDiscount: true,
  loyaltyDiscountPercentage: true,
  maintenanceMessage: true,
  openingAt: true,
  governorate: true,
  verified: true,
  billingCycle: true,
  subscriptionStartAt: true,
  subscriptionEndAt: true,
  plan: {
    select: {
      id: true,
      name: true,
      key: true,
      priceMonthly: true,
      priceYearly: true,
      maxProducts: true,
      maxImagesPerProduct: true,
    },
  },
  // Read-only for the merchant, but they need to know they're on the free
  // trial and when it ends — the dates alone can't distinguish a trial from
  // a paid period.
  subscription: {
    select: { status: true, trialEndsAt: true },
  },
};

@Injectable()
export class StoreSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: STORE_SETTINGS_SELECT,
    });
    if (!store) throw new NotFoundException('المتجر غير موجود');
    return store;
  }

  async update(storeId: string, dto: UpdateStoreSettingsDto) {
    const { openingAt, socialLinks, legalLinks, galleryImages, usdToSypRate, ...rest } = dto;
    const data: Prisma.StoreUpdateInput = { ...rest };
    if (usdToSypRate !== undefined) {
      data.usdToSypRate = usdToSypRate === null ? null : new Prisma.Decimal(usdToSypRate);
    }
    if (openingAt !== undefined) {
      data.openingAt = openingAt ? new Date(openingAt) : null;
    }
    if (socialLinks !== undefined) {
      data.socialLinks = socialLinks === null ? Prisma.JsonNull : socialLinks;
    }
    if (legalLinks !== undefined) {
      data.legalLinks = legalLinks === null ? Prisma.JsonNull : legalLinks;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data });

      if (galleryImages !== undefined) {
        await tx.storeGalleryImage.deleteMany({ where: { storeId } });
        if (galleryImages.length) {
          await tx.storeGalleryImage.createMany({
            data: galleryImages.map((img, i) => ({
              storeId,
              url: img.url,
              publicId: img.publicId ?? null,
              sortOrder: i,
            })),
          });
        }
      }

      return tx.store.findUniqueOrThrow({
        where: { id: storeId },
        select: STORE_SETTINGS_SELECT,
      });
    });
  }

  async listAnnouncements(storeId: string) {
    return this.prisma.announcement.findMany({
      where: { storeId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createAnnouncement(storeId: string, dto: AnnouncementDto) {
    return this.prisma.announcement.create({
      data: {
        storeId,
        message: dto.message,
        link: dto.link || null,
        type: dto.type,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isVisible: dto.isVisible,
        showOnMobile: dto.showOnMobile,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async updateAnnouncement(
    storeId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ) {
    const existing = await this.prisma.announcement.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new NotFoundException('الإعلان غير موجود');

    const { startDate, endDate, link, ...rest } = dto;
    const data: Prisma.AnnouncementUpdateInput = { ...rest };
    if (link !== undefined) data.link = link || null;
    if (startDate !== undefined)
      data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
      data.endDate = endDate ? new Date(endDate) : null;

    return this.prisma.announcement.update({ where: { id }, data });
  }

  async deleteAnnouncement(storeId: string, id: string) {
    const existing = await this.prisma.announcement.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new NotFoundException('الإعلان غير موجود');
    await this.prisma.announcement.delete({ where: { id } });
    return { deleted: true };
  }

  async listHomepageSections(storeId: string) {
    return this.prisma.homepageSection.findMany({
      where: { storeId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createHomepageSection(storeId: string, dto: HomepageSectionDto) {
    return this.prisma.homepageSection.create({
      data: {
        storeId,
        type: dto.type,
        title: dto.title || null,
        subtitle: dto.subtitle || null,
        description: dto.description || null,
        config: dto.config ?? Prisma.JsonNull,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isVisible: dto.isVisible,
        showOnMobile: dto.showOnMobile,
        showOnDesktop: dto.showOnDesktop,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async updateHomepageSection(
    storeId: string,
    id: string,
    dto: UpdateHomepageSectionDto,
  ) {
    const existing = await this.prisma.homepageSection.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new NotFoundException('القسم غير موجود');

    const {
      startDate,
      endDate,
      title,
      subtitle,
      description,
      config,
      ...rest
    } = dto;
    const data: Prisma.HomepageSectionUpdateInput = { ...rest };
    if (title !== undefined) data.title = title || null;
    if (subtitle !== undefined) data.subtitle = subtitle || null;
    if (description !== undefined) data.description = description || null;
    if (config !== undefined) data.config = config ?? Prisma.JsonNull;
    if (startDate !== undefined)
      data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
      data.endDate = endDate ? new Date(endDate) : null;

    return this.prisma.homepageSection.update({ where: { id }, data });
  }

  async reorderHomepageSections(
    storeId: string,
    { sectionIds }: ReorderHomepageSectionsDto,
  ) {
    const ownedCount = await this.prisma.homepageSection.count({
      where: { storeId, id: { in: sectionIds } },
    });
    if (ownedCount !== sectionIds.length) {
      throw new NotFoundException('يتضمن الترتيب قسماً غير موجود');
    }
    await this.prisma.$transaction(
      sectionIds.map((id, sortOrder) =>
        this.prisma.homepageSection.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );
    return this.listHomepageSections(storeId);
  }

  async deleteHomepageSection(storeId: string, id: string) {
    const existing = await this.prisma.homepageSection.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new NotFoundException('القسم غير موجود');
    await this.prisma.homepageSection.delete({ where: { id } });
    return { deleted: true };
  }
}
