// Seeds a single demo restaurant store — "لا بيلا بيتزا" — specialized in
// pizza and pasta, with real professional food photography (Wikimedia
// Commons / TheMealDB, all freely licensed) instead of the placeholder/random
// images the other demo seeds use.
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, StoreStatus, BillingCycle } from '../generated/prisma';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@12345';

const SLUG = 'la-bella-pizza';
const OWNER_EMAIL = 'labella-demo@souq-syria.com';
const OWNER_NAME = 'ماركو أنطونيو';
const STORE_NAME = 'لا بيلا بيتزا';

interface DemoProduct {
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  category: string;
  image: string;
  featured?: boolean;
}

const CATEGORIES = ['بيتزا', 'باستا', 'مقبلات وسلطات', 'حلويات', 'مشروبات'];

const PRODUCTS: DemoProduct[] = [
  // ── بيتزا ──────────────────────────────────────────────────────────
  {
    name: 'بيتزا مارغريتا',
    description: 'عجينة إيطالية تقليدية مخبوزة على الحطب، صوص طماطم طازج، جبنة موزاريلا وريحان',
    price: 32000,
    stock: 30,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/margherita.jpg',
    featured: true,
  },
  {
    name: 'بيتزا ببروني',
    description: 'صوص طماطم، طبقة سخية من جبنة الموزاريلا وشرائح الببروني المقرمشة',
    price: 38000,
    compareAtPrice: 44000,
    stock: 28,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/pepperoni.jpg',
    featured: true,
  },
  {
    name: 'بيتزا أربع أجبان',
    description: 'مزيج فاخر من الموزاريلا والغورغونزولا والبارميزان والريكوتا',
    price: 40000,
    stock: 20,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/fourcheese.jpg',
  },
  {
    name: 'بيتزا خضار مشكلة',
    description: 'فليفلة ملونة، ذرة، زيتون وفطر طازج فوق قاعدة جبنة موزاريلا',
    price: 34000,
    stock: 22,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/veggie.jpg',
  },
  {
    name: 'بيتزا دجاج مشوي',
    description: 'قطع دجاج متبلة ومشوية، أعشاب طازجة وجبنة موزاريلا ذائبة',
    price: 39000,
    stock: 24,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/chicken.jpg',
    featured: true,
  },
  {
    name: 'بيتزا اللحوم الفاخرة',
    description: 'ببروني، سجق إيطالي ولحم مقدد — لعشاق اللحوم',
    price: 44000,
    compareAtPrice: 50000,
    stock: 18,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/meatlovers.jpg',
  },
  {
    name: 'بيتزا الفطر',
    description: 'فطر طازج مقلي بالثوم والزبدة فوق قاعدة كريمية وجبنة موزاريلا',
    price: 36000,
    stock: 20,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/funghi.jpg',
  },
  {
    name: 'كالزوني محشو',
    description: 'عجينة بيتزا مطوية ومحشوة بالجبنة واللحم المقدد والفليفلة، مخبوزة حتى الذهبي',
    price: 37000,
    stock: 16,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/calzone.jpg',
  },
  {
    name: 'بيتزا مارينارا',
    description: 'الوصفة النابوليتانية الأصلية — طماطم وثوم وزيت زيتون بدون جبنة',
    price: 28000,
    stock: 25,
    category: 'بيتزا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/marinara.jpg',
  },

  // ── باستا ──────────────────────────────────────────────────────────
  {
    name: 'سباغيتي كاربونارا',
    description: 'صوص كريمي بالبيض وجبنة البارميزان ولحم مقدد مقرمش',
    price: 35000,
    stock: 22,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/carbonara.jpg',
    featured: true,
  },
  {
    name: 'فيتوتشيني ألفريدو',
    description: 'باستا فيتوتشيني بصوص كريمة غني وجبنة بارميزان مبشورة',
    price: 33000,
    stock: 24,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/alfredo.jpg',
  },
  {
    name: 'سباغيتي بولونيز',
    description: 'صوص لحم مفروم بالطماطم مطهو ببطء على الطريقة الإيطالية التقليدية',
    price: 34000,
    stock: 20,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/bolognese.jpg',
    featured: true,
  },
  {
    name: 'بيني أرابياتا',
    description: 'باستا بيني بصوص طماطم حار مع ثوم وفليفلة حمراء',
    price: 29000,
    stock: 26,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/arrabbiata.jpg',
  },
  {
    name: 'لازانيا باللحمة',
    description: 'طبقات عجين اللازانيا مع صوص بولونيز وبشاميل وجبنة مخبوزة',
    price: 42000,
    compareAtPrice: 48000,
    stock: 15,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/lasagna.jpg',
    featured: true,
  },
  {
    name: 'باستا بيستو جنوفيزي',
    description: 'صوص ريحان وصنوبر وزيت زيتون وبارميزان طازج',
    price: 31000,
    stock: 18,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/pesto.jpg',
  },
  {
    name: 'ماك آند تشيز مخبوز',
    description: 'معكرونة بصوص جبنة كريمي غني، مخبوزة حتى القشرة الذهبية',
    price: 27000,
    stock: 20,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/macncheese.jpg',
  },
  {
    name: 'سباغيتي المأكولات البحرية',
    description: 'روبيان وبلح البحر مقلية مع الثوم والريحان الطازج',
    price: 46000,
    compareAtPrice: 52000,
    stock: 12,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/seafoodpasta.jpg',
  },
  {
    name: 'رافيولي بصوص الكريما',
    description: 'رافيولي محشو بالجبنة، بصوص كريما وأعشاب',
    price: 38000,
    stock: 14,
    category: 'باستا',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/ravioli.jpg',
  },

  // ── مقبلات وسلطات ──────────────────────────────────────────────────
  {
    name: 'خبز بالثوم والجبنة',
    description: 'خبز إيطالي مخبوز بالثوم والزبدة وجبنة الموزاريلا الذائبة',
    price: 16000,
    stock: 35,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/garlicbread.jpg',
    featured: true,
  },
  {
    name: 'أصابع الموزاريلا المقرمشة',
    description: 'جبنة موزاريلا مقرمشة من الخارج وذائبة من الداخل، تقدم مع صوص المارينارا',
    price: 18000,
    stock: 30,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/mozzsticks.jpg',
  },
  {
    name: 'بروسكيتا بالطماطم',
    description: 'خبز محمص مغطى بالطماطم الطازجة والثوم وزيت الزيتون',
    price: 14000,
    stock: 28,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/bruschetta.jpg',
  },
  {
    name: 'سلطة سيزر',
    description: 'خس روماني، جبنة بارميزان، خبز محمص وصوص السيزر الأصلي',
    price: 19000,
    stock: 25,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/caesar.jpg',
    featured: true,
  },
  {
    name: 'سلطة كابريزي',
    description: 'طماطم طازجة وجبنة موزاريلا وريحان مع زيت الزيتون البكر',
    price: 20000,
    stock: 22,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/caprese.jpg',
  },
  {
    name: 'أجنحة دجاج حارة',
    description: 'أجنحة دجاج مقرمشة بصوص حار، تقدم مع الكرفس',
    price: 24000,
    stock: 26,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/wings.jpg',
  },
  {
    name: 'بطاطا مقلية',
    description: 'بطاطا مقرمشة ذهبية، تقدم ساخنة مع الكاتشب',
    price: 12000,
    stock: 40,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/fries.jpg',
  },
  {
    name: 'شوربة خضار حارة',
    description: 'شوربة حمص وخضار طازجة منعشة بالكزبرة والتوابل',
    price: 13000,
    stock: 24,
    category: 'مقبلات وسلطات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/minestrone.jpg',
  },

  // ── حلويات ────────────────────────────────────────────────────────
  {
    name: 'تيراميسو',
    description: 'الحلوى الإيطالية الكلاسيكية بطبقات القهوة والماسكاربوني والكاكاو',
    price: 17000,
    stock: 20,
    category: 'حلويات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/tiramisu.jpg',
    featured: true,
  },
  {
    name: 'تشيز كيك بالفراولة',
    description: 'قطعة تشيز كيك كريمية مغطاة بصوص الفراولة الطازج',
    price: 16000,
    stock: 18,
    category: 'حلويات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/cheesecake.jpg',
  },
  {
    name: 'لافا كيك بالشوكولا',
    description: 'كيك شوكولا دافئ بقلب سائل ذائب، يقدم فور الخروج من الفرن',
    price: 18000,
    compareAtPrice: 22000,
    stock: 15,
    category: 'حلويات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/lavacake.jpg',
    featured: true,
  },
  {
    name: 'بانا كوتا بالكراميل',
    description: 'حلوى كريمية إيطالية طرية مغطاة بصوص الكراميل',
    price: 15000,
    stock: 20,
    category: 'حلويات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/pannacotta.jpg',
  },
  {
    name: 'جيلاتو إيطالي',
    description: 'آيس كريم إيطالي كريمي بنكهات متعددة',
    price: 11000,
    stock: 30,
    category: 'حلويات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/gelato.jpg',
  },

  // ── مشروبات ───────────────────────────────────────────────────────
  {
    name: 'ليموناضة بالنعنع',
    description: 'مشروب ليمون طازج ومنعش بأوراق النعنع',
    price: 8000,
    stock: 40,
    category: 'مشروبات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/lemonade.jpg',
  },
  {
    name: 'عصير برتقال طازج',
    description: 'عصير برتقال طبيعي 100%، معصور طازجاً',
    price: 9000,
    stock: 35,
    category: 'مشروبات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/orangejuice.jpg',
  },
  {
    name: 'شاي مثلج بالليمون',
    description: 'شاي بارد ومنعش مع شرائح الليمون',
    price: 7000,
    stock: 40,
    category: 'مشروبات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/icedtea.jpg',
  },
  {
    name: 'كابتشينو',
    description: 'إسبريسو إيطالي أصيل مع رغوة حليب كريمية',
    price: 10000,
    stock: 40,
    category: 'مشروبات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/cappuccino.jpg',
  },
  {
    name: 'مشروب غازي',
    description: 'كولا باردة تقدم مع الثلج',
    price: 5000,
    stock: 60,
    category: 'مشروبات',
    image: 'http://localhost:4000/uploads/products/la-bella-pizza/softdrink.jpg',
  },
];

const HERO_IMAGES = [
  'http://localhost:4000/uploads/products/la-bella-pizza/hero1.jpg',
  'http://localhost:4000/uploads/products/la-bella-pizza/hero2.jpg',
  'http://localhost:4000/uploads/products/la-bella-pizza/hero3.jpg',
];

async function findOrCreatePlan() {
  const plan = await prisma.plan.findFirst({ where: { key: 'business' } });
  if (!plan) throw new Error('Business plan not found — run prisma/seed.ts first');
  return plan;
}

async function main() {
  const plan = await findOrCreatePlan();

  const existingOwner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL, storeId: null } });
  if (existingOwner) {
    console.log(`SKIP (owner already exists): ${OWNER_EMAIL}`);
    return;
  }

  const now = new Date();
  const subscriptionEndAt = new Date(now);
  subscriptionEndAt.setFullYear(subscriptionEndAt.getFullYear() + 1);

  const owner = await prisma.user.create({
    data: {
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: Role.MERCHANT,
    },
  });

  const store = await prisma.store.create({
    data: {
      ownerId: owner.id,
      name: STORE_NAME,
      slug: SLUG,
      description: 'مطعم إيطالي متخصص بالبيتزا المخبوزة على الحطب والباستا الطازجة، بوصفات أصيلة ومكونات مختارة بعناية.',
      primaryColor: '#B91C1C',
      status: StoreStatus.ACTIVE,
      planId: plan.id,
      billingCycle: BillingCycle.YEARLY,
      subscriptionStartAt: now,
      subscriptionEndAt,
      businessCategories: ['RESTAURANT_FOOD'],
      currency: 'SYP',
      codAvailable: true,
      pickupEnabled: true,
      pickupAddress: 'دمشق، شارع الحمرا، مقابل حديقة السبكي',
    },
  });

  const catByName = new Map<string, { id: string }>();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const name = CATEGORIES[i];
    const created = await prisma.category.create({
      data: { storeId: store.id, name, slug: name, sortOrder: i },
    });
    catByName.set(name, created);
  }

  let created = 0;
  for (const p of PRODUCTS) {
    const category = catByName.get(p.category);
    await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category?.id ?? null,
        name: p.name,
        description: p.description,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        stock: p.stock,
        isActive: true,
        isFeatured: !!p.featured,
        images: {
          create: [{ url: p.image, sortOrder: 0 }],
        },
      },
    });
    created++;
  }

  await prisma.homepageSection.create({
    data: {
      storeId: store.id,
      type: 'HERO_SLIDER',
      sortOrder: 0,
      config: {
        slides: HERO_IMAGES.map((imageUrl) => ({ imageUrl })),
      },
    },
  });

  const sections: { type: string; title: string; sortOrder: number; config?: object }[] = [
    { type: 'FEATURED_PRODUCTS', title: 'الأكثر طلباً', sortOrder: 1, config: { limit: 8 } },
    { type: 'NEW_ARRIVALS', title: 'وصل حديثاً', sortOrder: 2 },
    { type: 'BEST_SELLERS', title: 'الأكثر مبيعاً', sortOrder: 3 },
  ];
  for (const s of sections) {
    await prisma.homepageSection.create({
      data: { storeId: store.id, type: s.type as never, title: s.title, sortOrder: s.sortOrder, config: s.config ?? {} },
    });
  }

  console.log(`CREATED store="${STORE_NAME}" slug=${SLUG} owner=${OWNER_EMAIL} products=${created}`);
  console.log(`Merchant password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
