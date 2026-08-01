import { StoreThemeConfig } from './dto/store-theme.schemas';

export type StoreThemeTemplateId = 'MINIMAL' | 'MODERN' | 'CLASSIC';

export interface ThemeTemplateDefinition {
  id: StoreThemeTemplateId;
  version: number;
  name: string;
  nameAr: string;
  description: string;
  defaultConfig: StoreThemeConfig;
}

// "Souq" identity — a warm Levantine-market palette (brass/terracotta on
// cream) so every new store starts distinctive instead of a generic
// teal-on-white SaaS look. Mirrors the `--color-souq-*` tokens already in
// frontend/src/index.css.
const MINIMAL_CONFIG: StoreThemeConfig = {
  colors: {
    primary: '#B5502C',
    accent: '#0F6F63',
    background: '#FAF9F5',
    surface: '#FFFFFF',
    surfaceMuted: '#F4EBDA',
    text: '#2C2116',
    mutedText: '#7C6242',
    border: '#E9DAC0',
    success: '#16A34A',
    destructive: '#DC2626',
  },
  typography: {
    headingFont: 'amiri',
    bodyFont: 'cairo',
    scale: 'default',
    headingWeight: 'bold',
  },
  buttons: { radius: 'soft', style: 'solid', size: 'default' },
  productCards: {
    radius: 'medium',
    shadow: 'soft',
    imageRatio: 'square',
    alignment: 'start',
    showRating: true,
    showWishlist: true,
    showCategory: true,
    textColor: '#2C2116',
  },
  header: {
    layout: 'compact',
    sticky: true,
    showSearch: true,
    showContactActions: false,
    backgroundColor: '#FFFFFF',
    textColor: '#2C2116',
  },
  categoriesNavigation: {
    style: 'underline',
    sticky: false,
    showImages: false,
    backgroundColor: '#FFFFFF',
    textColor: '#2C2116',
  },
  footer: {
    layout: 'simple',
    showDescription: true,
    showCategories: false,
    showContact: true,
    showSocialLinks: true,
    backgroundColor: '#F4EBDA',
    textColor: '#2C2116',
  },
  layout: { contentWidth: 'normal', sectionSpacing: 'comfortable', cardDensity: 'comfortable' },
  slider: { radius: 'large', height: 'default', autoplay: true, showArrows: true, showIndicators: true },
};

const MODERN_CONFIG: StoreThemeConfig = {
  colors: {
    primary: '#7C3AED',
    accent: '#DB2777',
    background: '#FFFFFF',
    surface: '#FAF5FF',
    surfaceMuted: '#F3E8FF',
    text: '#1E1B2E',
    mutedText: '#6B7280',
    border: '#E9D5FF',
    success: '#16A34A',
    destructive: '#DC2626',
  },
  typography: {
    headingFont: 'inter',
    bodyFont: 'inter',
    scale: 'large',
    headingWeight: 'extrabold',
  },
  buttons: { radius: 'pill', style: 'solid', size: 'default' },
  productCards: {
    radius: 'large',
    shadow: 'elevated',
    imageRatio: 'portrait',
    alignment: 'start',
    showRating: true,
    showWishlist: true,
    showCategory: true,
    textColor: '#1E1B2E',
  },
  header: {
    layout: 'search-focused',
    sticky: true,
    showSearch: true,
    showContactActions: true,
    backgroundColor: '#FFFFFF',
    textColor: '#1E1B2E',
  },
  categoriesNavigation: {
    style: 'pills',
    sticky: true,
    showImages: true,
    backgroundColor: '#FAF5FF',
    textColor: '#1E1B2E',
  },
  footer: {
    layout: 'columns',
    showDescription: true,
    showCategories: true,
    showContact: true,
    showSocialLinks: true,
    backgroundColor: '#FAF5FF',
    textColor: '#1E1B2E',
  },
  layout: { contentWidth: 'wide', sectionSpacing: 'comfortable', cardDensity: 'comfortable' },
  slider: { radius: 'large', height: 'large', autoplay: true, showArrows: true, showIndicators: true },
};

const CLASSIC_CONFIG: StoreThemeConfig = {
  colors: {
    primary: '#B45309',
    accent: '#78350F',
    background: '#FFFDF7',
    surface: '#FFFFFF',
    surfaceMuted: '#FEF3E2',
    text: '#1C1917',
    mutedText: '#78716C',
    border: '#E7E0D3',
    success: '#15803D',
    destructive: '#B91C1C',
  },
  typography: {
    headingFont: 'tajawal',
    bodyFont: 'tajawal',
    scale: 'default',
    headingWeight: 'bold',
  },
  buttons: { radius: 'square', style: 'solid', size: 'default' },
  productCards: {
    radius: 'medium',
    shadow: 'soft',
    imageRatio: 'square',
    alignment: 'center',
    showRating: true,
    showWishlist: false,
    showCategory: true,
    textColor: '#1C1917',
  },
  header: {
    layout: 'centered',
    sticky: false,
    showSearch: true,
    showContactActions: true,
    backgroundColor: '#FFFDF7',
    textColor: '#1C1917',
  },
  categoriesNavigation: {
    style: 'solid',
    sticky: false,
    showImages: false,
    backgroundColor: '#FEF3E2',
    textColor: '#1C1917',
  },
  footer: {
    layout: 'columns',
    showDescription: true,
    showCategories: true,
    showContact: true,
    showSocialLinks: false,
    backgroundColor: '#FEF3E2',
    textColor: '#1C1917',
  },
  layout: { contentWidth: 'normal', sectionSpacing: 'spacious', cardDensity: 'compact' },
  slider: { radius: 'none', height: 'compact', autoplay: false, showArrows: true, showIndicators: false },
};

// Fills any config groups/fields missing from a stored config (e.g. rows
// persisted before a schema addition like header.backgroundColor) with the
// matching template's defaults, so older DB rows never crash on a field
// that didn't exist when they were written. Stored values always win.
export function normalizeThemeConfig(
  stored: Partial<StoreThemeConfig> | null | undefined,
  templateId: StoreThemeTemplateId,
): StoreThemeConfig {
  const defaults = STORE_THEME_TEMPLATES[templateId].defaultConfig;
  if (!stored) return defaults;
  const merged = { ...defaults } as StoreThemeConfig;
  for (const key of Object.keys(defaults) as (keyof StoreThemeConfig)[]) {
    const storedGroup = stored[key];
    if (storedGroup && typeof storedGroup === 'object') {
      merged[key] = { ...defaults[key], ...storedGroup } as never;
    }
  }
  return merged;
}

export const STORE_THEME_TEMPLATES: Record<StoreThemeTemplateId, ThemeTemplateDefinition> = {
  MINIMAL: {
    id: 'MINIMAL',
    version: 2,
    name: 'Minimal',
    nameAr: 'بسيط',
    description: 'واجهة نظيفة وهادئة مع تنقل مضغوط وبطاقات منتج محايدة.',
    defaultConfig: MINIMAL_CONFIG,
  },
  MODERN: {
    id: 'MODERN',
    version: 2,
    name: 'Modern',
    nameAr: 'عصري',
    description: 'خطوط أقوى وبطاقات منتج مدورة وهيدر يركز على البحث.',
    defaultConfig: MODERN_CONFIG,
  },
  CLASSIC: {
    id: 'CLASSIC',
    version: 2,
    name: 'Classic',
    nameAr: 'كلاسيكي',
    description: 'هيدر وفوتر منظمان وتنقل تصنيفات تقليدي وعرض منتجات أكثر كثافة.',
    defaultConfig: CLASSIC_CONFIG,
  },
};
