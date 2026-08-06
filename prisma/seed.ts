import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '../generated/prisma';
import { seedCities } from './seeds/cities.seed';

const prisma = new PrismaClient();

const PLANS = [
  {
    key: 'basic',
    name: 'أساسي',
    description: 'لبدء متجرك الأول والتعرف على المنصة',
    priceMonthly: 50000,
    priceYearly: 500000,
    maxProducts: 50,
    features: ['حتى 50 منتج', 'لوحة تحكم كاملة', 'دعم عبر البريد الإلكتروني'],
    featureKeys: ['BASIC_TEMPLATES', 'THEME_DRAFTS', 'CUSTOM_COLORS'],
    order: 1,
  },
  {
    key: 'pro',
    name: 'احترافي',
    description: 'للمتاجر النشطة اللي بتحتاج مساحة أكبر ودعم أسرع',
    priceMonthly: 120000,
    priceYearly: 1200000,
    maxProducts: 500,
    features: [
      'حتى 500 منتج',
      'لوحة تحكم كاملة',
      'دعم ذو أولوية',
      'تقارير مبيعات متقدمة',
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
      'CUSTOMER_EMAILS',
    ],
    order: 2,
  },
  {
    key: 'business',
    name: 'أعمال',
    description: 'للمتاجر الكبيرة بدون حدود على عدد المنتجات',
    priceMonthly: 250000,
    priceYearly: 2500000,
    maxProducts: null,
    features: [
      'منتجات غير محدودة',
      'لوحة تحكم كاملة',
      'مدير حساب مخصص',
      'تقارير مبيعات متقدمة',
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
