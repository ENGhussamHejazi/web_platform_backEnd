import { updateThemeDraftSchema } from './store-theme.schemas';
import { STORE_THEME_TEMPLATES } from '../templates';

describe('updateThemeDraftSchema', () => {
  it('accepts a valid partial config group', () => {
    const result = updateThemeDraftSchema.safeParse({
      config: { colors: STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.colors },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid hex color', () => {
    const result = updateThemeDraftSchema.safeParse({
      config: { colors: { ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.colors, primary: 'not-a-color' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unapproved font id', () => {
    const result = updateThemeDraftSchema.safeParse({
      config: {
        typography: {
          ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.typography,
          headingFont: 'comic-sans',
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown enum value', () => {
    const result = updateThemeDraftSchema.safeParse({
      config: {
        buttons: { ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.buttons, radius: 'giant' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields on a config group', () => {
    const result = updateThemeDraftSchema.safeParse({
      config: {
        colors: { ...STORE_THEME_TEMPLATES.MINIMAL.defaultConfig.colors, injectedField: '<script>' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown top-level template id', () => {
    const result = updateThemeDraftSchema.safeParse({ templateId: 'NOT_A_TEMPLATE' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty payload', () => {
    const result = updateThemeDraftSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
