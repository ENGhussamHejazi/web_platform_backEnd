import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '../generated/prisma';
import { seedCities } from './seeds/cities.seed';

const prisma = new PrismaClient();

// Plan prices are in **USD** (see frontend/src/lib/planPricing.ts) — platform
// billing is dollar-denominated regardless of the currency a merchant sells in
// on their own storefront (`Store.currency`, which stays merchant-controlled).
//
// The ladder is value-derived rather than arbitrary: every tier includes the
// same core platform (storefront, orders, COD checkout, shipping zones,
// customer accounts, returns/refunds, invoices) and is then priced on what it
// actually unlocks in code — catalog capacity, images per product, the theme
// gates in store-theme.service.ts, the report gates in
// merchant-reports.controller.ts, CUSTOMER_CHAT and CUSTOMER_EMAILS.
//
// `features` is display-only marketing copy; `featureKeys` is what the
// entitlements service actually enforces. Keep the two saying the same thing —
// a bullet with no matching gate is a promise the product doesn't keep.
const PLANS = [
  {
    key: 'basic',
    name: 'أساسي',
    description: 'لإطلاق متجرك الأول والبيع من اليوم الأول',
    priceMonthly: 12,
    priceYearly: 120,
    maxProducts: 50,
    maxImagesPerProduct: 3,
    features: [
      'حتى 50 منتج، و3 صور لكل منتج',
      'متجر إلكتروني كامل مع الدفع عند الاستلام',
      'إدارة الطلبات والشحن حسب المحافظة',
      'حسابات عملاء وتقييمات ومراجعات',
      'قالب أساسي مع إمكانية تغيير ألوان المتجر',
      'تقارير المبيعات وأداء المنتجات',
      'دعم عبر البريد الإلكتروني',
    ],
    featureKeys: ['BASIC_TEMPLATES', 'CUSTOM_COLORS'],
    order: 1,
  },
  {
    key: 'pro',
    name: 'احترافي',
    description: 'للمتاجر النامية التي تحتاج تصميماً أوسع وتحليلات وتواصلاً مباشراً مع العملاء',
    priceMonthly: 30,
    priceYearly: 300,
    maxProducts: 500,
    maxImagesPerProduct: 6,
    features: [
      'كل ميزات الباقة الأساسية',
      'حتى 500 منتج، و6 صور لكل منتج',
      'قوالب متقدمة (عصري وكلاسيكي)',
      'تخصيص الخطوط والأزرار وبطاقات المنتج والهيدر',
      'حفظ مسودات التصميم قبل نشرها',
      'دردشة مباشرة مع عملاء متجرك',
      'رسائل بريد للعملاء بهوية متجرك',
      'تحليلات المخزون وسجل حركة المخزون',
      'دعم ذو أولوية',
    ],
    featureKeys: [
      'BASIC_TEMPLATES',
      'ADVANCED_TEMPLATES',
      'THEME_DRAFTS',
      'CUSTOM_COLORS',
      'CUSTOM_TYPOGRAPHY',
      'CUSTOM_BUTTONS',
      'CUSTOM_PRODUCT_CARDS',
      'CUSTOM_HEADER',
      'REPORTS_INVENTORY_ANALYTICS',
      'REPORTS_STOCK_MOVEMENTS',
      'CUSTOMER_CHAT',
      'CUSTOMER_EMAILS',
    ],
    order: 2,
  },
  {
    key: 'business',
    name: 'أعمال',
    description: 'للمتاجر الكبيرة: بلا حدود على الكتالوج، تخصيص كامل، وسجل مالي شامل',
    priceMonthly: 42,
    priceYearly: 420,
    maxProducts: null,
    maxImagesPerProduct: 8,
    features: [
      'كل ميزات الباقة الاحترافية',
      'منتجات غير محدودة، و8 صور لكل منتج',
      'تخصيص كامل للتصميم: الفوتر والتخطيط والسلايدر',
      'فتح كل خيارات تخصيص المظهر دفعة واحدة',
      'سجل المعاملات المالية الكامل',
      'مدير حساب مخصص',
    ],
    featureKeys: [
      'BASIC_TEMPLATES',
      'ADVANCED_TEMPLATES',
      'THEME_DRAFTS',
      'CUSTOM_COLORS',
      'CUSTOM_TYPOGRAPHY',
      'CUSTOM_BUTTONS',
      'CUSTOM_PRODUCT_CARDS',
      'CUSTOM_HEADER',
      'CUSTOM_FOOTER',
      'CUSTOM_LAYOUT',
      'CUSTOM_SLIDER',
      'ADVANCED_THEME_CUSTOMIZATION',
      'REPORTS_INVENTORY_ANALYTICS',
      'REPORTS_STOCK_MOVEMENTS',
      'REPORTS_TRANSACTIONS',
      'CUSTOMER_CHAT',
      'CUSTOMER_EMAILS',
    ],
    order: 3,
  },
];

async function seedPlans() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    });
  }
  console.log(`تم زرع ${PLANS.length} باقات اشتراك`);
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@souq-syria.com';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'Admin@12345';
  const name = process.env.SUPER_ADMIN_NAME ?? 'مدير المنصة';

  const existing = await prisma.user.findFirst({ where: { email, storeId: null } });
  if (existing) {
    console.log(`مدير المنصة موجود بالفعل: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: Role.SUPER_ADMIN,
    },
  });

  console.log('تم إنشاء حساب مدير المنصة:');
  console.log(`  البريد: ${email}`);
  console.log(`  كلمة المرور: ${password}`);
}

async function main() {
  await seedPlans();
  await seedSuperAdmin();
  await seedCities(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
