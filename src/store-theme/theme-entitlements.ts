import { FeatureKey } from '../entitlements/feature-keys';
import { ThemeConfigGroup } from './dto/store-theme.schemas';
import { StoreThemeTemplateId } from './templates';

// Maps each editable config group to the feature key that must be present
// on the store's plan to write it. Kept as a plain map (not hardcoded plan
// names) so package boundaries can be redrawn by editing `Plan.featureKeys`
// alone, never this file.
export const THEME_FIELD_GROUP_FEATURE_MAP: Record<ThemeConfigGroup, FeatureKey> = {
  colors: 'CUSTOM_COLORS',
  typography: 'CUSTOM_TYPOGRAPHY',
  buttons: 'CUSTOM_BUTTONS',
  productCards: 'CUSTOM_PRODUCT_CARDS',
  header: 'CUSTOM_HEADER',
  // Category navigation is visually and functionally part of the header
  // region — gated with the same key rather than inventing a near-duplicate.
  categoriesNavigation: 'CUSTOM_HEADER',
  footer: 'CUSTOM_FOOTER',
  layout: 'CUSTOM_LAYOUT',
  slider: 'CUSTOM_SLIDER',
};

export const TEMPLATE_FEATURE_MAP: Record<StoreThemeTemplateId, FeatureKey> = {
  MINIMAL: 'BASIC_TEMPLATES',
  MODERN: 'ADVANCED_TEMPLATES',
  CLASSIC: 'ADVANCED_TEMPLATES',
};
