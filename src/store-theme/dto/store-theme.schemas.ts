import { z } from 'zod';

// Fixed allow-list — never free text. Keeps font loading bounded and rules
// out any font-family injection.
export const APPROVED_FONT_IDS = [
  'system',
  'cairo',
  'tajawal',
  'inter',
  'almarai',
  'amiri',
] as const;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'اللون يجب أن يكون بصيغة hex صحيحة');

const colorsSchema = z
  .object({
    primary: hexColor,
    accent: hexColor,
    background: hexColor,
    surface: hexColor,
    surfaceMuted: hexColor,
    text: hexColor,
    mutedText: hexColor,
    border: hexColor,
    success: hexColor,
    destructive: hexColor,
  })
  .strict();

const typographySchema = z
  .object({
    headingFont: z.enum(APPROVED_FONT_IDS),
    bodyFont: z.enum(APPROVED_FONT_IDS),
    scale: z.enum(['compact', 'default', 'large']),
    headingWeight: z.enum(['semibold', 'bold', 'extrabold']),
  })
  .strict();

const buttonsSchema = z
  .object({
    radius: z.enum(['square', 'soft', 'rounded', 'pill']),
    style: z.enum(['solid', 'outline', 'soft']),
    size: z.enum(['compact', 'default', 'large']),
  })
  .strict();

const productCardsSchema = z
  .object({
    radius: z.enum(['small', 'medium', 'large']),
    shadow: z.enum(['none', 'soft', 'elevated']),
    imageRatio: z.enum(['square', 'portrait', 'landscape']),
    alignment: z.enum(['start', 'center']),
    showRating: z.boolean(),
    showWishlist: z.boolean(),
    showCategory: z.boolean(),
    textColor: hexColor,
  })
  .strict();

const headerSchema = z
  .object({
    layout: z.enum(['compact', 'centered', 'search-focused']),
    sticky: z.boolean(),
    showSearch: z.boolean(),
    showContactActions: z.boolean(),
    showHomeLink: z.boolean(),
    showCategories: z.boolean(),
    showChat: z.boolean(),
    showWishlist: z.boolean(),
    showAccount: z.boolean(),
    showCart: z.boolean(),
    searchPlaceholder: z.string().trim().max(80),
    backgroundColor: hexColor,
    textColor: hexColor,
  })
  .strict();

const footerSchema = z
  .object({
    layout: z.enum(['simple', 'columns', 'centered']),
    showDescription: z.boolean(),
    showCategories: z.boolean(),
    showContact: z.boolean(),
    showSocialLinks: z.boolean(),
    backgroundColor: hexColor,
    textColor: hexColor,
  })
  .strict();

const layoutSchema = z
  .object({
    contentWidth: z.enum(['normal', 'wide', 'full']),
    sectionSpacing: z.enum(['compact', 'comfortable', 'spacious']),
    cardDensity: z.enum(['compact', 'comfortable']),
  })
  .strict();

const sliderSchema = z
  .object({
    radius: z.enum(['none', 'medium', 'large']),
    height: z.enum(['compact', 'default', 'large']),
    autoplay: z.boolean(),
    showArrows: z.boolean(),
    showIndicators: z.boolean(),
  })
  .strict();

// One schema per top-level config group — keys here are exactly the groups
// gated by THEME_FIELD_GROUP_FEATURE_MAP in store-theme.service.ts.
export const themeConfigGroupSchemas = {
  colors: colorsSchema,
  typography: typographySchema,
  buttons: buttonsSchema,
  productCards: productCardsSchema,
  header: headerSchema,
  footer: footerSchema,
  layout: layoutSchema,
  slider: sliderSchema,
} as const;

export type ThemeConfigGroup = keyof typeof themeConfigGroupSchemas;

export const storeThemeConfigSchema = z
  .object({
    colors: colorsSchema,
    typography: typographySchema,
    buttons: buttonsSchema,
    productCards: productCardsSchema,
    header: headerSchema,
    footer: footerSchema,
    layout: layoutSchema,
    slider: sliderSchema,
  })
  .strict();

export type StoreThemeConfig = z.infer<typeof storeThemeConfigSchema>;

export const storeThemeTemplateIdSchema = z.enum(['MINIMAL', 'MODERN', 'CLASSIC']);

// PATCH .../draft accepts a partial config (only the groups being edited)
// plus an optional template switch. Every present group is still fully
// validated (no partial group updates — an editor "Save" always sends a
// complete group object for anything it touched).
export const updateThemeDraftSchema = z
  .object({
    templateId: storeThemeTemplateIdSchema.optional(),
    config: z
      .object({
        colors: colorsSchema.optional(),
        typography: typographySchema.optional(),
        buttons: buttonsSchema.optional(),
        productCards: productCardsSchema.optional(),
        header: headerSchema.optional(),
        footer: footerSchema.optional(),
        layout: layoutSchema.optional(),
        slider: sliderSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => v.templateId !== undefined || v.config !== undefined, {
    message: 'يجب إرسال قالب أو إعدادات تصميم على الأقل',
  });

export type UpdateThemeDraftDto = z.infer<typeof updateThemeDraftSchema>;

export const resetThemeSchema = z
  .object({
    scope: z.enum(['draft', 'template-defaults']),
  })
  .strict();

export type ResetThemeDto = z.infer<typeof resetThemeSchema>;

// 20kb is generous for this config shape (a full config JSON.stringifies to
// well under 2kb) — this is a hard ceiling against pathological payloads,
// not a realistic limit.
export const MAX_THEME_CONFIG_BYTES = 20_000;
