import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.plan.findFirst({ where: { isActive: true } });
  if (!plan) throw new Error('no plan found, seed plans first');

  const passwordHash = await bcrypt.hash('Test@12345', 10);
  const slug = 'checkout-test-store';

  const existingOwner = await prisma.user.findFirst({
    where: { email: 'checkout-test-owner@example.com' },
  });
  const owner =
    existingOwner ??
    (await prisma.user.create({
      data: {
        name: 'تاجر اختبار الدفع',
        email: 'checkout-test-owner@example.com',
        passwordHash,
        role: 'MERCHANT',
      },
    }));

  const store = await prisma.store.upsert({
    where: { slug },
    update: { status: 'ACTIVE', planId: plan.id, codAvailable: true },
    create: {
      ownerId: owner.id,
      name: 'متجر اختبار الدفع',
      slug,
      description: 'متجر لاختبار سلة التسوق والدفع عند الاستلام',
      primaryColor: '#0EA5A4',
      status: 'ACTIVE',
      planId: plan.id,
      codAvailable: true,
      currency: 'SYP',
      contactWhatsapp: '+963911111111',
    },
  });

  const category =
    (await prisma.category.findFirst({ where: { storeId: store.id } })) ??
    (await prisma.category.create({ data: { storeId: store.id, name: 'عام', sortOrder: 1 } }));

  await prisma.product.deleteMany({ where: { storeId: store.id } });
  const inStock = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: category.id,
      name: 'منتج للاختبار',
      price: 50000,
      compareAtPrice: 65000,
      stock: 8,
      images: { create: [{ url: 'https://picsum.photos/seed/checkout1/400', sortOrder: 0 }] },
    },
  });
  const lowStock = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: category.id,
      name: 'منتج بكمية محدودة',
      price: 30000,
      stock: 2,
      images: { create: [{ url: 'https://picsum.photos/seed/checkout2/400', sortOrder: 0 }] },
    },
  });

  for (const { governorate, cost } of [
    { governorate: 'DAMASCUS' as const, cost: 15000 },
    { governorate: 'ALEPPO' as const, cost: 0 },
  ]) {
    const existingZone = await prisma.shippingZone.findFirst({
      where: { storeId: store.id, governorate, cityId: null },
    });
    if (existingZone) {
      await prisma.shippingZone.update({ where: { id: existingZone.id }, data: { cost } });
    } else {
      await prisma.shippingZone.create({ data: { storeId: store.id, governorate, cost } });
    }
  }

  const existingCustomer = await prisma.user.findFirst({
    where: { email: 'checkout-test-customer@example.com', storeId: store.id },
  });
  if (!existingCustomer) {
    await prisma.user.create({
      data: {
        name: 'زبون اختبار',
        email: 'checkout-test-customer@example.com',
        passwordHash,
        role: 'CUSTOMER',
        storeId: store.id,
      },
    });
  }

  console.log('تم إنشاء متجر اختبار الدفع:');
  console.log(`  الرابط: /store/${slug}`);
  console.log(`  منتج بمخزون: ${inStock.name} (${inStock.stock} قطعة)`);
  console.log(`  منتج بكمية محدودة: ${lowStock.name} (${lowStock.stock} قطعة)`);
  console.log(`  حساب زبون: checkout-test-customer@example.com / Test@12345`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
