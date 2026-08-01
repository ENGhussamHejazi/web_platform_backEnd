import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.plan.findFirst({ where: { isActive: true } });
  if (!plan) throw new Error('no plan');
  const passwordHash = await bcrypt.hash('Test@12345', 10);
  const email = 'reports-verify-owner@example.com';
  const slug = 'reports-verify-store';

  const owner =
    (await prisma.user.findFirst({ where: { email } })) ??
    (await prisma.user.create({
      data: { name: 'تاجر اختبار التقارير', email, passwordHash, role: 'MERCHANT' },
    }));
  const store = await prisma.store.upsert({
    where: { slug },
    update: { status: 'ACTIVE', planId: plan.id },
    create: {
      ownerId: owner.id,
      name: 'متجر اختبار التقارير الشامل',
      slug,
      status: 'ACTIVE',
      planId: plan.id,
      currency: 'SYP',
    },
  });

  await prisma.order.deleteMany({ where: { storeId: store.id } });
  await prisma.stockMovement.deleteMany({ where: { storeId: store.id } });
  await prisma.stockReservation.deleteMany({ where: { storeId: store.id } });
  await prisma.inventoryItem.deleteMany({ where: { storeId: store.id } });
  await prisma.product.deleteMany({ where: { storeId: store.id } });

  const cat = await prisma.category.upsert({
    where: { storeId_slug: { storeId: store.id, slug: 'electronics' } },
    update: {},
    create: { storeId: store.id, name: 'إلكترونيات', slug: 'electronics', sortOrder: 1 },
  });

  const products = await Promise.all([
    prisma.product.create({
      data: { storeId: store.id, categoryId: cat.id, name: 'سماعة لاسلكية', price: 45000, stock: 40 },
    }),
    prisma.product.create({
      data: { storeId: store.id, categoryId: cat.id, name: 'شاحن سريع', price: 15000, stock: 3 },
    }),
    prisma.product.create({
      data: { storeId: store.id, categoryId: cat.id, name: 'كابل USB-C', price: 5000, stock: 0 },
    }),
    prisma.product.create({
      data: { storeId: store.id, categoryId: cat.id, name: 'منتج بدون مبيعات', price: 8000, stock: 20 },
    }),
  ]);

  const existingZone = await prisma.shippingZone.findFirst({
    where: { storeId: store.id, governorate: 'DAMASCUS', cityId: null },
  });
  if (existingZone) {
    await prisma.shippingZone.update({ where: { id: existingZone.id }, data: { cost: 5000 } });
  } else {
    await prisma.shippingZone.create({
      data: { storeId: store.id, governorate: 'DAMASCUS', cost: 5000 },
    });
  }

  const login = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test@12345' }),
  }).then((r) => r.json());
  const token = login.accessToken;

  // Place & deliver a couple orders on the first two products so
  // topSellers/totalSold/StockMovement ledger have real data.
  for (const [productId, qty] of [[products[0].id, 3], [products[1].id, 1]] as const) {
    const order = await fetch(`http://localhost:4000/api/public/stores/${slug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId, quantity: qty }],
        guestName: 'زبون',
        guestPhone: '+963900000000',
        shippingAddress: 'دمشق - شارع الاختبار',
        governorate: 'DAMASCUS',
      }),
    }).then((r) => r.json());
    for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      await fetch(`http://localhost:4000/api/merchant/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
    }
  }

  console.log('Seeded store', slug, 'owner', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
