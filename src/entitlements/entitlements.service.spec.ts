import { EntitlementsService } from './entitlements.service';

describe('EntitlementsService', () => {
  let prisma: { store: { findUnique: jest.Mock } };
  let service: EntitlementsService;

  beforeEach(() => {
    prisma = { store: { findUnique: jest.fn() } };
    service = new EntitlementsService(prisma as never);
  });

  it('returns the feature keys attached to the store plan', async () => {
    prisma.store.findUnique.mockResolvedValue({
      plan: { featureKeys: ['BASIC_TEMPLATES', 'CUSTOM_COLORS'] },
    });
    await expect(service.getFeatureKeys('store-1')).resolves.toEqual([
      'BASIC_TEMPLATES',
      'CUSTOM_COLORS',
    ]);
  });

  it('returns an empty list when the store has no plan', async () => {
    prisma.store.findUnique.mockResolvedValue({ plan: null });
    await expect(service.getFeatureKeys('store-1')).resolves.toEqual([]);
  });

  it('hasFeature returns true when the key is present', async () => {
    prisma.store.findUnique.mockResolvedValue({ plan: { featureKeys: ['CUSTOM_COLORS'] } });
    await expect(service.hasFeature('store-1', 'CUSTOM_COLORS')).resolves.toBe(true);
  });

  it('hasFeature returns false when the key is absent', async () => {
    prisma.store.findUnique.mockResolvedValue({ plan: { featureKeys: ['CUSTOM_COLORS'] } });
    await expect(service.hasFeature('store-1', 'CUSTOM_TYPOGRAPHY')).resolves.toBe(false);
  });
});
