import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StoreThemeService } from './store-theme.service';
import { STORE_THEME_TEMPLATES } from './templates';

describe('StoreThemeService', () => {
  let prisma: {
    storeTheme: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    store: { findUnique: jest.Mock };
  };
  let entitlements: { hasFeature: jest.Mock; getFeatureKeys: jest.Mock };
  let service: StoreThemeService;

  beforeEach(() => {
    prisma = {
      storeTheme: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      store: { findUnique: jest.fn() },
    };
    entitlements = {
      hasFeature: jest.fn().mockResolvedValue(true),
      getFeatureKeys: jest.fn().mockResolvedValue([
        'BASIC_TEMPLATES',
        'ADVANCED_TEMPLATES',
        'CUSTOM_COLORS',
        'CUSTOM_TYPOGRAPHY',
        'CUSTOM_BUTTONS',
        'CUSTOM_PRODUCT_CARDS',
        'CUSTOM_HEADER',
        'CUSTOM_FOOTER',
        'CUSTOM_LAYOUT',
        'CUSTOM_SLIDER',
        'THEME_DRAFTS',
        'ADVANCED_THEME_CUSTOMIZATION',
      ]),
    };
    service = new StoreThemeService(prisma as never, entitlements as never);
  });

  describe('get / lazy creation', () => {
    it('creates a default MINIMAL theme seeded with the store primaryColor when none exists', async () => {
      prisma.storeTheme.findUnique.mockResolvedValue(null);
      prisma.store.findUnique.mockResolvedValue({ primaryColor: '#123456' });
      prisma.storeTheme.create.mockImplementation(({ data }) => ({ id: 'theme-1', ...data }));

      const result = await service.get('store-1');

      expect(prisma.storeTheme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storeId: 'store-1',
            templateId: 'MINIMAL',
          }),
        }),
      );
      expect((result.draftConfig as any).colors.primary).toBe('#123456');
    });

    it('returns the existing theme row without creating a new one', async () => {
      const existing = { id: 'theme-1', storeId: 'store-1', templateId: 'MINIMAL', draftConfig: {} };
      prisma.storeTheme.findUnique.mockResolvedValue(existing);

      const result = await service.get('store-1');

      expect(result.id).toBe(existing.id);
      expect(result.draftConfig).toEqual(STORE_THEME_TEMPLATES.MINIMAL.defaultConfig);
      expect(prisma.storeTheme.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the store itself does not exist', async () => {
      prisma.storeTheme.findUnique.mockResolvedValue(null);
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.get('missing-store')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateDraft', () => {
    const existingTheme = {
      id: 'theme-1',
      storeId: 'store-1',
      templateId: 'MINIMAL',
      templateVersion: 1,
      draftConfig: STORE_THEME_TEMPLATES.MINIMAL.defaultConfig,
      publishedConfig: null,
    };

    beforeEach(() => {
      prisma.storeTheme.findUnique.mockResolvedValue(existingTheme);
      prisma.storeTheme.update.mockImplementation(({ data }) => ({ ...existingTheme, ...data }));
    });

    it('merges an entitled config group into the draft', async () => {
      await service.updateDraft('store-1', {
        config: { colors: { ...existingTheme.draftConfig.colors, primary: '#000000' } },
      });

      expect(prisma.storeTheme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId: 'store-1' },
          data: expect.objectContaining({
            draftConfig: expect.objectContaining({
              colors: expect.objectContaining({ primary: '#000000' }),
            }),
          }),
        }),
      );
    });

    it('rejects a config group the store plan is not entitled to', async () => {
      entitlements.getFeatureKeys.mockResolvedValue(['THEME_DRAFTS']);

      await expect(
        service.updateDraft('store-1', {
          config: { typography: existingTheme.draftConfig.typography },
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.storeTheme.update).not.toHaveBeenCalled();
    });

    it('rejects switching to a template the plan is not entitled to', async () => {
      entitlements.getFeatureKeys.mockResolvedValue([]);

      await expect(service.updateDraft('store-1', { templateId: 'MODERN' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('publish', () => {
    it('copies draftConfig into publishedConfig and stamps publishedAt', async () => {
      const theme = {
        id: 'theme-1',
        storeId: 'store-1',
        templateId: 'MODERN',
        templateVersion: 1,
        draftConfig: { colors: { primary: '#111111' } },
      };
      prisma.storeTheme.findUnique.mockResolvedValue(theme);
      prisma.storeTheme.update.mockImplementation(({ data }) => data);

      const result = await service.publish('store-1');

      // getOrCreate normalizes the partial mock draftConfig against MODERN
      // defaults before publish copies it — so the published config is the
      // full merged shape, not the raw partial mock.
      expect(result.publishedConfig).toEqual({
        ...STORE_THEME_TEMPLATES.MODERN.defaultConfig,
        colors: { ...STORE_THEME_TEMPLATES.MODERN.defaultConfig.colors, primary: '#111111' },
      });
      expect(result.publishedTemplateId).toBe('MODERN');
      expect(result.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    it('reverts the draft to the published config when scope is "draft"', async () => {
      const theme = {
        id: 'theme-1',
        storeId: 'store-1',
        templateId: 'MODERN',
        templateVersion: 1,
        draftConfig: { colors: { primary: '#EDITED' } },
        publishedConfig: { colors: { primary: '#PUBLISHED' } },
        publishedTemplateId: 'MINIMAL',
        publishedTemplateVersion: 1,
      };
      prisma.storeTheme.findUnique.mockResolvedValue(theme);
      prisma.storeTheme.update.mockImplementation(({ data }) => data);

      const result = await service.reset('store-1', { scope: 'draft' });

      expect(result.draftConfig).toEqual({
        ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig,
        colors: { ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.colors, primary: '#PUBLISHED' },
      });
      expect(result.templateId).toBe('MINIMAL');
    });

    it('throws NotFoundException reverting to draft when nothing has been published yet', async () => {
      prisma.storeTheme.findUnique.mockResolvedValue({
        id: 'theme-1',
        storeId: 'store-1',
        templateId: 'MINIMAL',
        templateVersion: 1,
        draftConfig: {},
        publishedConfig: null,
      });

      await expect(service.reset('store-1', { scope: 'draft' })).rejects.toThrow(NotFoundException);
    });

    it('reverts the draft to the template defaults when scope is "template-defaults"', async () => {
      prisma.storeTheme.findUnique.mockResolvedValue({
        id: 'theme-1',
        storeId: 'store-1',
        templateId: 'CLASSIC',
        templateVersion: 1,
        draftConfig: { colors: { primary: '#EDITED' } },
        publishedConfig: null,
      });
      prisma.storeTheme.update.mockImplementation(({ data }) => data);

      const result = await service.reset('store-1', { scope: 'template-defaults' });

      expect(result.draftConfig).toEqual(STORE_THEME_TEMPLATES.CLASSIC.defaultConfig);
    });
  });

  describe('store isolation', () => {
    it('always scopes reads/writes by the storeId argument, never a cross-store id', async () => {
      prisma.storeTheme.findUnique.mockResolvedValue({
        id: 'theme-1',
        storeId: 'store-A',
        templateId: 'MINIMAL',
        templateVersion: 1,
        draftConfig: STORE_THEME_TEMPLATES.MINIMAL.defaultConfig,
      });
      prisma.storeTheme.update.mockImplementation(({ data }) => data);

      await service.updateDraft('store-A', { config: {} });

      expect(prisma.storeTheme.findUnique).toHaveBeenCalledWith({ where: { storeId: 'store-A' } });
      expect(prisma.storeTheme.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId: 'store-A' } }),
      );
    });
  });
});
