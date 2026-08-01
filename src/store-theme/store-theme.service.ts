import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { STORE_THEME_TEMPLATES, StoreThemeTemplateId, normalizeThemeConfig } from './templates';
import {
  MAX_THEME_CONFIG_BYTES,
  ResetThemeDto,
  StoreThemeConfig,
  UpdateThemeDraftDto,
} from './dto/store-theme.schemas';
import { THEME_FIELD_GROUP_FEATURE_MAP, TEMPLATE_FEATURE_MAP } from './theme-entitlements';

@Injectable()
export class StoreThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async getOrCreate(storeId: string) {
    const existing = await this.prisma.storeTheme.findUnique({ where: { storeId } });
    if (existing) {
      return {
        ...existing,
        draftConfig: normalizeThemeConfig(
          existing.draftConfig as Partial<StoreThemeConfig>,
          existing.templateId as StoreThemeTemplateId,
        ) as object,
        publishedConfig: existing.publishedConfig
          ? (normalizeThemeConfig(
              existing.publishedConfig as Partial<StoreThemeConfig>,
              (existing.publishedTemplateId ?? existing.templateId) as StoreThemeTemplateId,
            ) as object)
          : null,
      };
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { primaryColor: true },
    });
    if (!store) throw new NotFoundException('المتجر غير موجود');

    const defaultConfig: StoreThemeConfig = {
      ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig,
      colors: {
        ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.colors,
        primary: store.primaryColor,
      },
    };

    return this.prisma.storeTheme.create({
      data: {
        storeId,
        templateId: 'MINIMAL',
        templateVersion: STORE_THEME_TEMPLATES.MINIMAL.version,
        draftConfig: defaultConfig as object,
      },
    });
  }

  async get(storeId: string) {
    return this.getOrCreate(storeId);
  }

  async getTemplates() {
    return Object.values(STORE_THEME_TEMPLATES).map(({ defaultConfig: _defaultConfig, ...meta }) => meta);
  }

  async getEntitlements(storeId: string) {
    return { featureKeys: await this.entitlements.getFeatureKeys(storeId) };
  }

  async updateDraft(storeId: string, dto: UpdateThemeDraftDto) {
    const theme = await this.getOrCreate(storeId);

    // One fetch for every entitlement check below instead of a DB round trip
    // per config group — a single "save" can touch up to 9 groups at once,
    // and re-querying per group was slow enough to time out on a remote DB.
    const featureKeys = await this.entitlements.getFeatureKeys(storeId);
    const hasFeature = (key: (typeof TEMPLATE_FEATURE_MAP)[keyof typeof TEMPLATE_FEATURE_MAP]) =>
      featureKeys.includes(key);

    if (dto.config && Object.keys(dto.config).length > 0) {
      if (!hasFeature('THEME_DRAFTS')) {
        throw new ForbiddenException('باقتك الحالية لا تسمح بتعديل تصميم المتجر');
      }
    }

    if (dto.templateId) {
      const requiredFeature = TEMPLATE_FEATURE_MAP[dto.templateId];
      if (!hasFeature(requiredFeature)) {
        throw new ForbiddenException(
          `هذا القالب يتطلب ترقية الباقة (${requiredFeature})`,
        );
      }
    }

    for (const group of Object.keys(dto.config ?? {})) {
      const requiredFeature =
        THEME_FIELD_GROUP_FEATURE_MAP[group as keyof typeof THEME_FIELD_GROUP_FEATURE_MAP];
      if (!hasFeature(requiredFeature)) {
        throw new ForbiddenException(
          `تعديل "${group}" يتطلب ترقية الباقة (${requiredFeature})`,
        );
      }
    }

    const mergedConfig: StoreThemeConfig = {
      ...(theme.draftConfig as unknown as StoreThemeConfig),
      ...(dto.config ?? {}),
    };

    const payloadSize = JSON.stringify(mergedConfig).length;
    if (payloadSize > MAX_THEME_CONFIG_BYTES) {
      throw new ForbiddenException('إعدادات التصميم كبيرة جداً');
    }

    const nextTemplateId: StoreThemeTemplateId = dto.templateId ?? (theme.templateId as StoreThemeTemplateId);

    return this.prisma.storeTheme.update({
      where: { storeId },
      data: {
        templateId: nextTemplateId,
        templateVersion: dto.templateId
          ? STORE_THEME_TEMPLATES[nextTemplateId].version
          : theme.templateVersion,
        draftConfig: mergedConfig as object,
      },
    });
  }

  async publish(storeId: string) {
    const theme = await this.getOrCreate(storeId);
    return this.prisma.storeTheme.update({
      where: { storeId },
      data: {
        publishedConfig: theme.draftConfig as object,
        publishedTemplateId: theme.templateId,
        publishedTemplateVersion: theme.templateVersion,
        publishedAt: new Date(),
      },
    });
  }

  async reset(storeId: string, dto: ResetThemeDto) {
    const theme = await this.getOrCreate(storeId);

    if (dto.scope === 'draft') {
      if (!theme.publishedConfig) {
        throw new NotFoundException('لا يوجد نسخة منشورة للرجوع إليها');
      }
      return this.prisma.storeTheme.update({
        where: { storeId },
        data: {
          draftConfig: theme.publishedConfig as object,
          templateId: theme.publishedTemplateId ?? theme.templateId,
          templateVersion: theme.publishedTemplateVersion ?? theme.templateVersion,
        },
      });
    }

    const template = STORE_THEME_TEMPLATES[theme.templateId as StoreThemeTemplateId];
    return this.prisma.storeTheme.update({
      where: { storeId },
      data: {
        draftConfig: template.defaultConfig as object,
        templateVersion: template.version,
      },
    });
  }
}
