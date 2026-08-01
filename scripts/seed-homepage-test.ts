import { PrismaClient } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.plan.findFirst({ where: { isActive: true } });
  if (!plan) throw new Error('no plan found, seed plans first');

  const passwordHash = await bcrypt.hash('Test@12345', 10);
  const owner = await prisma.user.create({
    data: {
      name: 'تاجر تجريبي',
      email: `homepage-test-${Date.now()}@example.com`,
      passwordHash,
      role: 'MERCHANT',
    },
  });

  const store = await prisma.store.create({
    data: {
      ownerId: owner.id,
      name: 'متجر الاختبار',
      slug: 'homepage-test-store',
      description: 'وصف متجر الاختبار',
      primaryColor: '#0EA5A4',
      status: 'ACTIVE',
      planId: plan.id,
      contactWhatsapp: '+963911111111',
    },
  });

  const catClothes = await prisma.category.create({
    data: { storeId: store.id, name: 'ملابس', sortOrder: 1 },
  });
  const catShoes = await prisma.category.create({
    data: { storeId: store.id, name: 'أحذية', sortOrder: 2 },
  });

  const featuredProduct = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: catClothes.id,
      name: 'قميص مميز',
      price: 100000,
      stock: 10,
      isFeatured: true,
      images: { create: [{ url: 'https://picsum.photos/seed/1/400', sortOrder: 0 }] },
    },
  });
  const discountedProduct = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: catShoes.id,
      name: 'حذاء مخفض',
      price: 80000,
      compareAtPrice: 120000,
      stock: 5,
      images: { create: [{ url: 'https://picsum.photos/seed/2/400', sortOrder: 0 }] },
    },
  });
  const newProduct = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: catClothes.id,
      name: 'منتج جديد',
      price: 50000,
      stock: 20,
      images: { create: [{ url: 'https://picsum.photos/seed/3/400', sortOrder: 0 }] },
    },
  });

  const order = await prisma.order.create({
    data: {
      storeId: store.id,
      guestName: 'زبون تجريبي',
      guestPhone: '0911111111',
      subtotal: 100000,
      shippingCost: 0,
      total: 100000,
      shippingAddress: 'دمشق',
      governorate: 'DAMASCUS',
      status: 'DELIVERED',
      items: {
        create: [
          {
            productId: featuredProduct.id,
            productName: featuredProduct.name,
            quantity: 3,
            price: featuredProduct.price,
          },
        ],
      },
    },
  });

  await prisma.homepageSection.createMany({
    data: [
      {
        storeId: store.id,
        type: 'HERO_SLIDER',
        sortOrder: 0,
        config: {
          slides: [
            { imageUrl: 'https://picsum.photos/seed/hero1/1600/700', linkLabel: 'شريحة 1' },
            { imageUrl: 'https://picsum.photos/seed/hero2/1600/700', linkLabel: 'شريحة 2' },
          ],
        },
      },
      { storeId: store.id, type: 'FEATURED_CATEGORIES', title: 'تسوق حسب التصنيف', sortOrder: 1 },
      {
        storeId: store.id,
        type: 'FEATURED_PRODUCTS',
        title: 'منتجات مميزة',
        sortOrder: 2,
        config: { limit: 8 },
      },
      { storeId: store.id, type: 'BEST_SELLERS', title: 'الأكثر مبيعاً', sortOrder: 3 },
      { storeId: store.id, type: 'DISCOUNTED_PRODUCTS', title: 'عروض وخصومات', sortOrder: 4 },
      { storeId: store.id, type: 'NEW_ARRIVALS', title: 'وصل حديثاً', sortOrder: 5 },
      {
        storeId: store.id,
        type: 'PRODUCTS_BY_CATEGORY',
        title: 'تشكيلة الأحذية',
        sortOrder: 6,
        config: { categoryId: catShoes.id },
      },
      {
        storeId: store.id,
        type: 'STORE_BENEFITS',
        title: 'لماذا تختارنا',
        sortOrder: 7,
        config: {
          items: [
            { icon: 'truck', title: 'شحن سريع', description: 'توصيل خلال 3 أيام' },
            { icon: 'shield', title: 'دفع آمن' },
          ],
        },
      },
      { storeId: store.id, type: 'WHATSAPP_CTA', title: 'تواصل معنا', sortOrder: 8 },
      { storeId: store.id, type: 'NEWSLETTER', sortOrder: 9 },
    ],
  });

  console.log(
    'SEED_OK',
    JSON.stringify({
      storeId: store.id,
      slug: store.slug,
      orderId: order.id,
      discountedProductId: discountedProduct.id,
      newProductId: newProduct.id,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
