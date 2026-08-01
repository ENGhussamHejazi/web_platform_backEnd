import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const STORE_ID = '613e07e3-2529-4bcd-b873-bd176c7087a2'; // متجر nour

const NEW_CATEGORIES = [
  { name: 'ملابس نسائية', sortOrder: 3 },
  { name: 'اكسسوارات', sortOrder: 4 },
  { name: 'ساعات', sortOrder: 5 },
  { name: 'إلكترونيات', sortOrder: 6 },
  { name: 'مستلزمات منزلية', sortOrder: 7 },
  { name: 'عطور', sortOrder: 8 },
  { name: 'مستحضرات تجميل', sortOrder: 9 },
  { name: 'ألعاب أطفال', sortOrder: 10 },
];

function img(seed: string, w = 600, h = 600) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

async function main() {
  const existingCategories = await prisma.category.findMany({ where: { storeId: STORE_ID } });
  const catByName = new Map(existingCategories.map((c) => [c.name, c]));

  for (const c of NEW_CATEGORIES) {
    if (!catByName.has(c.name)) {
      const created = await prisma.category.create({
        data: { storeId: STORE_ID, name: c.name, slug: c.name, sortOrder: c.sortOrder },
      });
      catByName.set(c.name, created);
    }
  }

  const catKanza = catByName.get('كنز')!;
  const catShanta = catByName.get('شنظ')!;
  const catShoes = catByName.get('احذية')!;
  const catWomen = catByName.get('ملابس نسائية')!;
  const catAccessories = catByName.get('اكسسوارات')!;
  const catWatches = catByName.get('ساعات')!;
  const catElectronics = catByName.get('إلكترونيات')!;
  const catHome = catByName.get('مستلزمات منزلية')!;
  const catPerfume = catByName.get('عطور')!;
  const catBeauty = catByName.get('مستحضرات تجميل')!;
  const catToys = catByName.get('ألعاب أطفال')!;

  const products = [
    { name: 'كنزة صوف رجالي', description: 'كنزة شتوية دافئة، مقاسات متعددة', price: 145000, stock: 25, categoryId: catKanza.id, seed: 'p-kanza-1', featured: true },
    { name: 'كنزة قطن كاجوال', description: 'مريحة للاستخدام اليومي', price: 95000, compareAtPrice: 130000, stock: 18, categoryId: catKanza.id, seed: 'p-kanza-2' },
    { name: 'كنزة هودي', description: 'بقلنسوة، لون رمادي', price: 120000, stock: 12, categoryId: catKanza.id, seed: 'p-kanza-3' },
    { name: 'كنزة نسائية مطرزة', description: 'تصميم أنيق مع تطريز يدوي', price: 160000, stock: 8, categoryId: catKanza.id, seed: 'p-kanza-4', featured: true },
    { name: 'كنزة أطفال', description: 'قطن ناعم للأطفال', price: 70000, stock: 30, categoryId: catKanza.id, seed: 'p-kanza-5' },

    { name: 'شنطة يد جلدية', description: 'جلد طبيعي، صناعة محلية', price: 210000, compareAtPrice: 260000, stock: 10, categoryId: catShanta.id, seed: 'p-shanta-1', featured: true },
    { name: 'شنطة ظهر رياضية', description: 'مقاومة للماء، مساحة واسعة', price: 135000, stock: 22, categoryId: catShanta.id, seed: 'p-shanta-2' },
    { name: 'شنطة سفر كبيرة', description: 'عجلات دوارة 360 درجة', price: 320000, stock: 6, categoryId: catShanta.id, seed: 'p-shanta-3' },
    { name: 'شنطة كتف نسائية', description: 'تصميم عصري بألوان متعددة', price: 98000, stock: 15, categoryId: catShanta.id, seed: 'p-shanta-4' },

    { name: 'حذاء رياضي رجالي', description: 'مناسب للجري والمشي', price: 165000, compareAtPrice: 200000, stock: 20, categoryId: catShoes.id, seed: 'p-shoes-1', featured: true },
    { name: 'حذاء كلاسيكي جلد', description: 'مناسبة للمناسبات الرسمية', price: 190000, stock: 9, categoryId: catShoes.id, seed: 'p-shoes-2' },
    { name: 'حذاء نسائي كعب', description: 'كعب متوسط، مريح للاستخدام الطويل', price: 110000, stock: 14, categoryId: catShoes.id, seed: 'p-shoes-3' },
    { name: 'صندل صيفي', description: 'خفيف ومناسب للصيف', price: 55000, compareAtPrice: 75000, stock: 40, categoryId: catShoes.id, seed: 'p-shoes-4' },
    { name: 'حذاء أطفال', description: 'مقاسات 25-35', price: 60000, stock: 25, categoryId: catShoes.id, seed: 'p-shoes-5' },

    { name: 'فستان سهرة', description: 'تصميم فاخر لسهرات المناسبات', price: 280000, stock: 5, categoryId: catWomen.id, seed: 'p-women-1', featured: true },
    { name: 'بلوزة نسائية', description: 'قماش قطني خفيف', price: 65000, stock: 30, categoryId: catWomen.id, seed: 'p-women-2' },
    { name: 'بنطلون جينز نسائي', description: 'قصة عصرية مريحة', price: 88000, compareAtPrice: 110000, stock: 20, categoryId: catWomen.id, seed: 'p-women-3' },
    { name: 'عباءة سوداء', description: 'تصميم كلاسيكي أنيق', price: 175000, stock: 12, categoryId: catWomen.id, seed: 'p-women-4' },

    { name: 'نظارة شمسية', description: 'حماية UV400', price: 45000, stock: 35, categoryId: catAccessories.id, seed: 'p-acc-1' },
    { name: 'حزام جلدي رجالي', description: 'جلد طبيعي مع إبزيم معدني', price: 38000, stock: 28, categoryId: catAccessories.id, seed: 'p-acc-2' },
    { name: 'محفظة جلدية', description: 'تصميم أنيق مع جيوب متعددة', price: 52000, compareAtPrice: 68000, stock: 22, categoryId: catAccessories.id, seed: 'p-acc-3' },
    { name: 'وشاح شتوي', description: 'صوف ناعم دافئ', price: 32000, stock: 40, categoryId: catAccessories.id, seed: 'p-acc-4' },

    { name: 'ساعة يد كلاسيكية', description: 'مقاومة للماء، سوار جلدي', price: 145000, stock: 15, categoryId: catWatches.id, seed: 'p-watch-1', featured: true },
    { name: 'ساعة رياضية ذكية', description: 'تتبع اللياقة والنبض', price: 230000, compareAtPrice: 280000, stock: 10, categoryId: catWatches.id, seed: 'p-watch-2' },
    { name: 'ساعة نسائية أنيقة', description: 'تصميم فاخر بسوار معدني', price: 175000, stock: 8, categoryId: catWatches.id, seed: 'p-watch-3' },

    { name: 'كنزة صوف نسائية فاخرة', description: 'خيوط صوف مستوردة، دفء عالي', price: 168000, compareAtPrice: 210000, stock: 11, categoryId: catKanza.id, seed: 'p-kanza-6' },
    { name: 'شنطة كروس رجالية', description: 'جلد صناعي متين، مساحة تخزين جيدة', price: 76000, stock: 19, categoryId: catShanta.id, seed: 'p-shanta-5' },
    { name: 'حذاء بوت شتوي', description: 'مقاوم للماء ومبطن من الداخل', price: 205000, compareAtPrice: 245000, stock: 13, categoryId: catShoes.id, seed: 'p-shoes-6', featured: true },
    { name: 'طقم اكسسوارات نسائي', description: 'يشمل قلادة وأقراط وسوار', price: 58000, stock: 24, categoryId: catAccessories.id, seed: 'p-acc-5' },
    { name: 'ساعة جيب كلاسيكية', description: 'تصميم عتيق، هدية مميزة', price: 132000, stock: 7, categoryId: catWatches.id, seed: 'p-watch-4' },

    { name: 'سماعات لاسلكية', description: 'بلوتوث 5.0، عزل ضوضاء', price: 185000, compareAtPrice: 230000, stock: 16, categoryId: catElectronics.id, seed: 'p-elec-1', featured: true },
    { name: 'شاحن سريع متعدد المنافذ', description: '4 منافذ USB-C وUSB-A', price: 62000, stock: 30, categoryId: catElectronics.id, seed: 'p-elec-2' },

    { name: 'طقم أكواب قهوة', description: '6 قطع، بورسلان فاخر', price: 48000, stock: 20, categoryId: catHome.id, seed: 'p-home-1' },
    { name: 'مفرش سرير قطني', description: 'مقاس دبل، تصميم عصري', price: 95000, compareAtPrice: 120000, stock: 14, categoryId: catHome.id, seed: 'p-home-2' },

    { name: 'عطر رجالي فاخر', description: 'رائحة خشبية عود، 100 مل', price: 155000, stock: 12, categoryId: catPerfume.id, seed: 'p-perf-1', featured: true },
    { name: 'عطر نسائي زهري', description: 'رائحة زهرية منعشة، 80 مل', price: 128000, stock: 15, categoryId: catPerfume.id, seed: 'p-perf-2' },

    { name: 'طقم مكياج كامل', description: 'ظلال وأحمر شفاه وكونسيلر', price: 88000, compareAtPrice: 110000, stock: 18, categoryId: catBeauty.id, seed: 'p-beauty-1' },
    { name: 'كريم ترطيب للبشرة', description: 'مناسب لجميع أنواع البشرة', price: 42000, stock: 26, categoryId: catBeauty.id, seed: 'p-beauty-2' },

    { name: 'دمية دب محشو', description: 'قماش ناعم، حجم متوسط', price: 35000, stock: 22, categoryId: catToys.id, seed: 'p-toy-1' },
    { name: 'سيارة تحكم عن بعد', description: 'بطارية قابلة للشحن، سرعة عالية', price: 78000, compareAtPrice: 95000, stock: 10, categoryId: catToys.id, seed: 'p-toy-2', featured: true },
  ];

  let created = 0;
  for (const p of products) {
    const exists = await prisma.product.findFirst({ where: { storeId: STORE_ID, name: p.name } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        storeId: STORE_ID,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        stock: p.stock,
        isFeatured: !!p.featured,
        images: {
          create: [
            { url: img(p.seed), sortOrder: 0 },
            { url: img(p.seed + '-b'), sortOrder: 1 },
          ],
        },
      },
    });
    created++;
  }

  const heroSlides = [
    { imageUrl: img('nour-hero-1', 1600, 700), linkLabel: 'تشكيلة الشتاء الجديدة' },
    { imageUrl: img('nour-hero-2', 1600, 700), linkLabel: 'عروض حتى 30%' },
    { imageUrl: img('nour-hero-3', 1600, 700), linkLabel: 'أحذية موسم جديد' },
    { imageUrl: img('nour-hero-4', 1600, 700), linkLabel: 'اكسسوارات مختارة' },
    { imageUrl: img('nour-hero-5', 1600, 700), linkLabel: 'ساعات فاخرة' },
  ];

  const heroSection = await prisma.homepageSection.findFirst({ where: { storeId: STORE_ID, type: 'HERO_SLIDER' } });
  if (heroSection) {
    await prisma.homepageSection.update({
      where: { id: heroSection.id },
      data: { config: { slides: heroSlides } },
    });
  } else {
    await prisma.homepageSection.create({
      data: { storeId: STORE_ID, type: 'HERO_SLIDER', sortOrder: 0, config: { slides: heroSlides } },
    });
  }

  const wantedSections: { type: string; title: string; sortOrder: number; config?: object }[] = [
    { type: 'FEATURED_PRODUCTS', title: 'منتجات مميزة', sortOrder: 3, config: { limit: 8 } },
    { type: 'BEST_SELLERS', title: 'الأكثر مبيعاً', sortOrder: 4 },
    { type: 'NEW_ARRIVALS', title: 'وصل حديثاً', sortOrder: 5 },
  ];
  for (const s of wantedSections) {
    const exists = await prisma.homepageSection.findFirst({ where: { storeId: STORE_ID, type: s.type as never } });
    if (!exists) {
      await prisma.homepageSection.create({
        data: { storeId: STORE_ID, type: s.type as never, title: s.title, sortOrder: s.sortOrder, config: s.config ?? {} },
      });
    }
  }

  console.log('SEED_OK', JSON.stringify({ productsCreated: created, heroSlides: heroSlides.length }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
