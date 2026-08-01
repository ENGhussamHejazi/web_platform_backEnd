import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const EMAIL = 'theme-test@example.com';
const PASSWORD = 'Test@12345';
const SLUG = 'theme-test-store';

async function main() {
  // "pro" (not the cheapest "basic" plan) so this store has ADVANCED_TEMPLATES
  // and can exercise template switching, not just the locked-control path.
  const plan =
    (await prisma.plan.findFirst({ where: { key: 'pro' } })) ??
    (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { order: 'asc' } }));
  if (!plan) throw new Error('no plan found, run `npm run seed` first');

  let owner = await prisma.user.findFirst({ where: { email: EMAIL, storeId: null } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        name: 'تاجر اختبار التصميم',
        email: EMAIL,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: 'MERCHANT',
      },
    });
  }

  let store = await prisma.store.findUnique({ where: { slug: SLUG } });
  if (!store) {
    store = await prisma.store.create({
      data: {
        ownerId: owner.id,
        name: 'متجر اختبار التصميم',
        slug: SLUG,
        primaryColor: '#0EA5A4',
        status: 'ACTIVE',
        planId: plan.id,
      },
    });
  } else if (store.planId !== plan.id) {
    store = await prisma.store.update({ where: { id: store.id }, data: { planId: plan.id } });
  }

  const productCount = await prisma.product.count({ where: { storeId: store.id } });
  if (productCount === 0) {
    const category = await prisma.category.create({
      data: { storeId: store.id, name: 'عام', slug: 'general', sortOrder: 1 },
    });
    await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: 'منتج تجريبي',
        price: 25000,
        stock: 10,
        isActive: true,
      },
    });
  }

  console.log('SEED_OK', JSON.stringify({ email: EMAIL, password: PASSWORD, slug: store.slug }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
