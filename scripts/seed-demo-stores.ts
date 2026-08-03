import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, StoreStatus, BillingCycle } from '../generated/prisma';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@12345';

function img(keywords: string, lock: number, w = 700, h = 700) {
  return `https://loremflickr.com/${w}/${h}/${keywords}?lock=${lock}`;
}

interface DemoProduct {
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  category: string;
  keywords: string;
  lock: number;
  featured?: boolean;
  soldByWeight?: boolean;
  weightUnit?: 'KG' | 'GRAM';
  minOrderQuantity?: number;
  stepQuantity?: number;
}

interface DemoStore {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  primaryColor: string;
  businessCategories: string[];
  description: string;
  categories: string[];
  products: DemoProduct[];
  heroKeywords: string;
}

const STORES: DemoStore[] = [
  {
    slug: 'demo-restaurant',
    name: 'مطعم الشام',
    ownerName: 'أبو خالد',
    ownerEmail: 'restaurant-demo@souq-syria.com',
    primaryColor: '#DC2626',
    businessCategories: ['RESTAURANT_FOOD'],
    description: 'مطعم سوري تقليدي يقدم المشاوي والمقبلات والحلويات الشرقية.',
    categories: ['مقبلات', 'مشاوي وأطباق رئيسية', 'ساندويشات وشاورما', 'بيتزا وباستا', 'مشروبات', 'حلويات'],
    heroKeywords: 'restaurant,food,arabic',
    products: [
      { name: 'حمص بالطحينة', description: 'حمص كريمي مع زيت الزيتون وحبات الحمص كاملة', price: 15000, stock: 40, category: 'مقبلات', keywords: 'hummus,food', lock: 1001, featured: true },
      { name: 'متبل باذنجان', description: 'باذنجان مشوي مع الطحينة والرمان', price: 14000, stock: 35, category: 'مقبلات', keywords: 'eggplant,dip', lock: 1002 },
      { name: 'تبولة', description: 'سلطة برغل وبقدونس وطماطم طازجة', price: 12000, stock: 30, category: 'مقبلات', keywords: 'tabbouleh,salad', lock: 1003 },
      { name: 'فتوش', description: 'خضار طازجة مع خبز مقرمش وسماق', price: 13000, stock: 30, category: 'مقبلات', keywords: 'fattoush,salad', lock: 1004 },
      { name: 'كبة مقلية', description: 'كبة برغل محشوة باللحم المفروم والصنوبر', price: 22000, stock: 25, category: 'مقبلات', keywords: 'kibbeh,fried', lock: 1005, featured: true },
      { name: 'مشاوي مشكلة', description: 'كباب وشيش طاووق وريش لحم مع الأرز', price: 65000, compareAtPrice: 78000, stock: 20, category: 'مشاوي وأطباق رئيسية', keywords: 'grilled,meat,kebab', lock: 1006, featured: true },
      { name: 'شيش طاووق', description: 'قطع دجاج متبلة مشوية على الفحم', price: 45000, stock: 25, category: 'مشاوي وأطباق رئيسية', keywords: 'chicken,skewer', lock: 1007 },
      { name: 'كباب حلبي', description: 'كباب لحم مشوي بالطريقة الحلبية', price: 52000, stock: 22, category: 'مشاوي وأطباق رئيسية', keywords: 'kebab,grill', lock: 1008 },
      { name: 'ورق عنب بزيت الزيتون', description: 'ورق عنب محشو بالأرز والخضار', price: 28000, stock: 18, category: 'مشاوي وأطباق رئيسية', keywords: 'stuffed,grape,leaves', lock: 1009 },
      { name: 'مقلوبة دجاج', description: 'أرز وباذنجان ودجاج مقلوب على الطبق', price: 48000, compareAtPrice: 58000, stock: 15, category: 'مشاوي وأطباق رئيسية', keywords: 'rice,chicken,dish', lock: 1010 },
      { name: 'شاورما دجاج', description: 'شاورما دجاج بالثوم والبطاطا المقلية', price: 25000, stock: 35, category: 'ساندويشات وشاورما', keywords: 'shawarma,chicken', lock: 1011, featured: true },
      { name: 'شاورما لحم', description: 'شاورما لحم بقري مع صوص طحينة', price: 28000, stock: 30, category: 'ساندويشات وشاورما', keywords: 'shawarma,beef', lock: 1012 },
      { name: 'ساندويش فلافل', description: 'فلافل مقرمشة مع خضار وطحينة', price: 10000, stock: 40, category: 'ساندويشات وشاورما', keywords: 'falafel,sandwich', lock: 1013 },
      { name: 'برجر لحم مشوي', description: 'برجر لحم بقري 200غ مع جبنة شيدر', price: 32000, compareAtPrice: 38000, stock: 20, category: 'ساندويشات وشاورما', keywords: 'burger,beef', lock: 1014, featured: true },
      { name: 'بيتزا مارغريتا', description: 'عجينة رقيقة مع جبنة موزاريلا وصوص طماطم', price: 35000, stock: 18, category: 'بيتزا وباستا', keywords: 'pizza,margherita', lock: 1015 },
      { name: 'بيتزا خضار', description: 'بيتزا بالفطر والفليفلة والزيتون', price: 33000, stock: 15, category: 'بيتزا وباستا', keywords: 'pizza,vegetable', lock: 1016 },
      { name: 'باستا الفريدو', description: 'باستا بصوص الكريما والفطر', price: 30000, stock: 20, category: 'بيتزا وباستا', keywords: 'pasta,alfredo', lock: 1017 },
      { name: 'عصير طبيعي مشكل', description: 'عصير فواكه طازج يومياً', price: 9000, stock: 50, category: 'مشروبات', keywords: 'juice,fruit', lock: 1018 },
      { name: 'ليموناضة بالنعنع', description: 'مشروب بارد منعش', price: 7000, stock: 45, category: 'مشروبات', keywords: 'lemonade,mint', lock: 1019 },
      { name: 'كنافة بالجبن', description: 'كنافة ساخنة بالجبن والقطر', price: 18000, compareAtPrice: 22000, stock: 20, category: 'حلويات', keywords: 'kunafa,dessert', lock: 1020, featured: true },
      { name: 'بقلاوة مشكلة', description: 'تشكيلة بقلاوة بالفستق واللوز', price: 20000, stock: 25, category: 'حلويات', keywords: 'baklava,pastry', lock: 1021 },
    ],
  },
  {
    slug: 'demo-electronics',
    name: 'متجر التقنية الحديثة',
    ownerName: 'سامر العلي',
    ownerEmail: 'electronics-demo@souq-syria.com',
    primaryColor: '#2563EB',
    businessCategories: ['ELECTRONICS'],
    description: 'أحدث الأجهزة الإلكترونية والهواتف والحواسيب بأسعار تنافسية.',
    categories: ['هواتف ذكية', 'حواسيب ولابتوب', 'سماعات وصوتيات', 'أجهزة منزلية', 'اكسسوارات تقنية', 'ألعاب فيديو'],
    heroKeywords: 'electronics,technology',
    products: [
      { name: 'هاتف ذكي Galaxy برو', description: 'شاشة 6.7 إنش، كاميرا ثلاثية، ذاكرة 256GB', price: 1250000, compareAtPrice: 1450000, stock: 12, category: 'هواتف ذكية', keywords: 'smartphone,android', lock: 2001, featured: true },
      { name: 'آيفون الجيل الأخير', description: 'معالج A-series قوي، شاشة OLED', price: 1850000, stock: 8, category: 'هواتف ذكية', keywords: 'iphone,smartphone', lock: 2002, featured: true },
      { name: 'هاتف اقتصادي 4G', description: 'بطارية تدوم يومين، مناسب للاستخدام اليومي', price: 320000, stock: 25, category: 'هواتف ذكية', keywords: 'phone,mobile', lock: 2003 },
      { name: 'لابتوب أعمال 15 إنش', description: 'معالج i7، رام 16GB، تخزين SSD 512GB', price: 2100000, compareAtPrice: 2400000, stock: 10, category: 'حواسيب ولابتوب', keywords: 'laptop,business', lock: 2004, featured: true },
      { name: 'لابتوب ألعاب Gaming', description: 'كرت شاشة مخصص، شاشة 144Hz', price: 3200000, stock: 6, category: 'حواسيب ولابتوب', keywords: 'gaming,laptop', lock: 2005 },
      { name: 'حاسوب مكتبي All-in-One', description: 'شاشة 24 إنش مدمجة، مناسب للمكتب', price: 1500000, stock: 8, category: 'حواسيب ولابتوب', keywords: 'desktop,computer', lock: 2006 },
      { name: 'شاشة كمبيوتر 27 إنش', description: 'دقة 4K، معدل تحديث عالي', price: 480000, stock: 15, category: 'حواسيب ولابتوب', keywords: 'monitor,display', lock: 2007 },
      { name: 'سماعات لاسلكية عازلة للضجيج', description: 'بلوتوث 5.3، بطارية 30 ساعة', price: 185000, compareAtPrice: 220000, stock: 30, category: 'سماعات وصوتيات', keywords: 'headphones,wireless', lock: 2008, featured: true },
      { name: 'سماعة بلوتوث للأذن', description: 'مقاومة للماء، صوت نقي', price: 95000, stock: 40, category: 'سماعات وصوتيات', keywords: 'earbuds,bluetooth', lock: 2009 },
      { name: 'مكبر صوت بلوتوث محمول', description: 'صوت جهير قوي، بطارية 12 ساعة', price: 140000, stock: 20, category: 'سماعات وصوتيات', keywords: 'speaker,bluetooth', lock: 2010 },
      { name: 'تلفزيون سمارت 55 إنش', description: '4K UHD، أندرويد TV مدمج', price: 1400000, compareAtPrice: 1650000, stock: 9, category: 'أجهزة منزلية', keywords: 'smart,tv', lock: 2011, featured: true },
      { name: 'مكنسة كهربائية روبوت', description: 'تنظيف ذكي بالخرائط، تحكم عبر التطبيق', price: 650000, stock: 12, category: 'أجهزة منزلية', keywords: 'robot,vacuum', lock: 2012 },
      { name: 'مكيف هواء سبليت', description: '1.5 طن، اقتصادي بالطاقة', price: 980000, stock: 7, category: 'أجهزة منزلية', keywords: 'air,conditioner', lock: 2013 },
      { name: 'كاميرا مراقبة ذكية', description: 'رؤية ليلية، تنبيهات فورية للهاتف', price: 165000, stock: 18, category: 'أجهزة منزلية', keywords: 'security,camera', lock: 2014 },
      { name: 'شاحن سريع متعدد المنافذ', description: '65W، 4 منافذ USB-C وUSB-A', price: 62000, stock: 50, category: 'اكسسوارات تقنية', keywords: 'charger,usb', lock: 2015 },
      { name: 'باور بانك 20000mAh', description: 'شحن سريع لأكثر من جهاز في آن واحد', price: 85000, compareAtPrice: 100000, stock: 35, category: 'اكسسوارات تقنية', keywords: 'powerbank,battery', lock: 2016 },
      { name: 'ساعة ذكية رياضية', description: 'تتبع اللياقة والنبض ومستوى الأكسجين', price: 230000, stock: 22, category: 'اكسسوارات تقنية', keywords: 'smartwatch,fitness', lock: 2017, featured: true },
      { name: 'كيبورد وماوس لاسلكي', description: 'طقم متكامل بإضاءة خلفية', price: 78000, stock: 28, category: 'اكسسوارات تقنية', keywords: 'keyboard,mouse', lock: 2018 },
      { name: 'يد تحكم PlayStation', description: 'أصلية، متوافقة مع أحدث الأجيال', price: 195000, stock: 15, category: 'ألعاب فيديو', keywords: 'gamepad,controller', lock: 2019 },
      { name: 'جهاز ألعاب PlayStation 5', description: 'إصدار قرصي، يدعم 4K وألعاب متعددة', price: 2400000, compareAtPrice: 2650000, stock: 5, category: 'ألعاب فيديو', keywords: 'playstation,console', lock: 2020, featured: true },
    ],
  },
  {
    slug: 'demo-fashion',
    name: 'بوتيك الأصالة',
    ownerName: 'رنا ديب',
    ownerEmail: 'fashion-demo@souq-syria.com',
    primaryColor: '#DB2777',
    businessCategories: ['FASHION_CLOTHING'],
    description: 'أزياء رجالية ونسائية عصرية بجودة عالية وأسعار مناسبة.',
    categories: ['ملابس نسائية', 'ملابس رجالية', 'أحذية', 'حقائب', 'اكسسوارات', 'ملابس أطفال'],
    heroKeywords: 'fashion,clothing,boutique',
    products: [
      { name: 'فستان سهرة طويل', description: 'قماش شيفون فاخر، مناسب للمناسبات', price: 275000, compareAtPrice: 320000, stock: 8, category: 'ملابس نسائية', keywords: 'dress,evening', lock: 3001, featured: true },
      { name: 'بلوزة حريرية', description: 'قماش ناعم بألوان متعددة', price: 68000, stock: 22, category: 'ملابس نسائية', keywords: 'blouse,silk', lock: 3002 },
      { name: 'تايير نسائي رسمي', description: 'مناسب للعمل والمناسبات الرسمية', price: 195000, stock: 12, category: 'ملابس نسائية', keywords: 'blazer,women', lock: 3003 },
      { name: 'عباءة سوداء مطرزة', description: 'تصميم كلاسيكي بتطريز يدوي', price: 185000, stock: 15, category: 'ملابس نسائية', keywords: 'abaya,black', lock: 3004 },
      { name: 'قميص رجالي كلاسيكي', description: 'قطن مصري، مقاسات متعددة', price: 72000, stock: 25, category: 'ملابس رجالية', keywords: 'shirt,men', lock: 3005, featured: true },
      { name: 'بدلة رجالية كاملة', description: 'قصة عصرية، مناسبة للمناسبات', price: 420000, compareAtPrice: 480000, stock: 6, category: 'ملابس رجالية', keywords: 'suit,men', lock: 3006 },
      { name: 'جينز رجالي', description: 'قصة سليم فيت، خامة متينة', price: 85000, stock: 30, category: 'ملابس رجالية', keywords: 'jeans,men', lock: 3007 },
      { name: 'جاكيت شتوي رجالي', description: 'مبطن، مقاوم للبرد', price: 165000, stock: 14, category: 'ملابس رجالية', keywords: 'jacket,winter', lock: 3008 },
      { name: 'حذاء كلاسيكي جلد', description: 'مناسب للمناسبات الرسمية', price: 190000, stock: 10, category: 'أحذية', keywords: 'leather,shoes', lock: 3009 },
      { name: 'حذاء رياضي', description: 'مريح للجري والمشي اليومي', price: 175000, compareAtPrice: 210000, stock: 20, category: 'أحذية', keywords: 'sneakers,sport', lock: 3010, featured: true },
      { name: 'صندل نسائي كعب', description: 'كعب متوسط الارتفاع، تصميم أنيق', price: 95000, stock: 18, category: 'أحذية', keywords: 'sandals,heels', lock: 3011 },
      { name: 'بوت شتوي', description: 'مقاوم للماء ومبطن من الداخل', price: 210000, stock: 12, category: 'أحذية', keywords: 'boots,winter', lock: 3012 },
      { name: 'شنطة يد جلدية', description: 'جلد طبيعي فاخر', price: 220000, compareAtPrice: 260000, stock: 9, category: 'حقائب', keywords: 'handbag,leather', lock: 3013, featured: true },
      { name: 'شنطة ظهر عصرية', description: 'مساحة واسعة، مناسبة للجامعة والعمل', price: 110000, stock: 20, category: 'حقائب', keywords: 'backpack,fashion', lock: 3014 },
      { name: 'محفظة جلدية رجالية', description: 'جيوب متعددة، تصميم أنيق', price: 55000, stock: 25, category: 'اكسسوارات', keywords: 'wallet,leather', lock: 3015 },
      { name: 'نظارة شمسية عصرية', description: 'حماية UV400 كاملة', price: 48000, stock: 30, category: 'اكسسوارات', keywords: 'sunglasses,fashion', lock: 3016 },
      { name: 'ساعة يد أنيقة', description: 'سوار جلدي، مقاومة للماء', price: 155000, stock: 15, category: 'اكسسوارات', keywords: 'wristwatch,fashion', lock: 3017 },
      { name: 'وشاح شتوي', description: 'صوف ناعم دافئ بألوان متعددة', price: 32000, stock: 35, category: 'اكسسوارات', keywords: 'scarf,winter', lock: 3018 },
      { name: 'طقم ملابس أطفال', description: 'قطن مريح، مقاسات متعددة', price: 45000, stock: 28, category: 'ملابس أطفال', keywords: 'kids,clothing', lock: 3019 },
      { name: 'فستان بناتي صيفي', description: 'قماش قطني خفيف بألوان زاهية', price: 38000, compareAtPrice: 48000, stock: 22, category: 'ملابس أطفال', keywords: 'girl,dress', lock: 3020 },
    ],
  },
  {
    slug: 'demo-supermarket',
    name: 'سوبرماركت البركة',
    ownerName: 'ياسر حمدان',
    ownerEmail: 'supermarket-demo@souq-syria.com',
    primaryColor: '#16A34A',
    businessCategories: ['GROCERY_SUPERMARKET'],
    description: 'كل ما يحتاجه بيتك من خضار وفواكه ولحوم ومواد غذائية طازجة يومياً.',
    categories: ['خضار وفواكه', 'لحوم ودجاج', 'ألبان وأجبان', 'مخبوزات', 'مواد غذائية', 'مشروبات ومياه'],
    heroKeywords: 'supermarket,grocery',
    products: [
      { name: 'طماطم بلدي', description: 'طماطم طازجة يومياً من المزارع المحلية', price: 4500, stock: 200, category: 'خضار وفواكه', keywords: 'tomato,fresh', lock: 4001, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 0.5, stepQuantity: 0.25 },
      { name: 'خيار طازج', description: 'خيار مقرمش مختار بعناية', price: 3500, stock: 150, category: 'خضار وفواكه', keywords: 'cucumber,vegetable', lock: 4002, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 0.5, stepQuantity: 0.25 },
      { name: 'موز', description: 'موز طازج مستورد', price: 8000, stock: 100, category: 'خضار وفواكه', keywords: 'banana,fruit', lock: 4003, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 1, stepQuantity: 0.5, featured: true },
      { name: 'تفاح أحمر', description: 'تفاح مستورد حلو المذاق', price: 12000, compareAtPrice: 15000, stock: 90, category: 'خضار وفواكه', keywords: 'apple,red', lock: 4004, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 1, stepQuantity: 0.5, featured: true },
      { name: 'بطاطا', description: 'بطاطا محلية درجة أولى', price: 3000, stock: 250, category: 'خضار وفواكه', keywords: 'potato,vegetable', lock: 4005, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 1, stepQuantity: 1 },
      { name: 'دجاج طازج كامل', description: 'دجاج مبرد طازج يومياً', price: 22000, stock: 40, category: 'لحوم ودجاج', keywords: 'chicken,fresh', lock: 4006, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 1, stepQuantity: 0.5, featured: true },
      { name: 'لحم بقري مفروم', description: 'لحم طازج مفروم يومياً', price: 65000, compareAtPrice: 75000, stock: 25, category: 'لحوم ودجاج', keywords: 'beef,meat', lock: 4007, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 0.5, stepQuantity: 0.25 },
      { name: 'صدور دجاج مقطعة', description: 'صدور دجاج منظفة وجاهزة للطبخ', price: 28000, stock: 35, category: 'لحوم ودجاج', keywords: 'chicken,breast', lock: 4008, soldByWeight: true, weightUnit: 'KG', minOrderQuantity: 0.5, stepQuantity: 0.5 },
      { name: 'لبنة بلدية', description: 'لبنة طازجة كريمية القوام', price: 18000, stock: 50, category: 'ألبان وأجبان', keywords: 'labneh,dairy', lock: 4009 },
      { name: 'جبنة بيضاء', description: 'جبنة بلدية طرية', price: 25000, stock: 40, category: 'ألبان وأجبان', keywords: 'cheese,white', lock: 4010, featured: true },
      { name: 'حليب طازج 1 لتر', description: 'حليب بقري كامل الدسم', price: 8500, stock: 80, category: 'ألبان وأجبان', keywords: 'milk,fresh', lock: 4011 },
      { name: 'زبدة طبيعية', description: 'زبدة بلدية بدون إضافات', price: 15000, stock: 30, category: 'ألبان وأجبان', keywords: 'butter,dairy', lock: 4012 },
      { name: 'خبز عربي طري', description: 'خبز طازج مخبوز يومياً', price: 3000, stock: 100, category: 'مخبوزات', keywords: 'bread,arabic', lock: 4013 },
      { name: 'كرواسون بالشوكولا', description: 'معجنات طرية بحشوة الشوكولا', price: 6000, stock: 60, category: 'مخبوزات', keywords: 'croissant,chocolate', lock: 4014 },
      { name: 'أرز بسمتي 5 كغ', description: 'أرز بسمتي فاخر مستورد', price: 85000, compareAtPrice: 95000, stock: 45, category: 'مواد غذائية', keywords: 'rice,basmati', lock: 4015, featured: true },
      { name: 'زيت زيتون بكر ممتاز', description: '1 لتر، معصور على البارد', price: 65000, stock: 30, category: 'مواد غذائية', keywords: 'olive,oil', lock: 4016 },
      { name: 'سكر أبيض 1 كغ', description: 'سكر ناعم درجة أولى', price: 9000, stock: 100, category: 'مواد غذائية', keywords: 'sugar,white', lock: 4017 },
      { name: 'معكرونة إيطالية', description: 'باستا مستوردة أنواع متعددة', price: 7500, stock: 70, category: 'مواد غذائية', keywords: 'pasta,italian', lock: 4018 },
      { name: 'مياه معدنية 1.5 لتر', description: 'صندوق 6 عبوات', price: 12000, stock: 90, category: 'مشروبات ومياه', keywords: 'water,bottle', lock: 4019 },
      { name: 'عصير برتقال طبيعي', description: 'عصير طازج بدون سكر مضاف', price: 14000, stock: 55, category: 'مشروبات ومياه', keywords: 'orange,juice', lock: 4020 },
    ],
  },
];

async function findOrCreatePlan() {
  const plan = await prisma.plan.findFirst({ where: { key: 'business' } });
  if (!plan) throw new Error('Business plan not found — run prisma/seed.ts first');
  return plan;
}

async function seedStore(def: DemoStore, planId: string) {
  const existingOwner = await prisma.user.findFirst({ where: { email: def.ownerEmail, storeId: null } });
  if (existingOwner) {
    console.log(`SKIP (owner exists): ${def.ownerEmail}`);
    return;
  }

  const now = new Date();
  const subscriptionEndAt = new Date(now);
  subscriptionEndAt.setFullYear(subscriptionEndAt.getFullYear() + 1);

  const owner = await prisma.user.create({
    data: {
      name: def.ownerName,
      email: def.ownerEmail,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: Role.MERCHANT,
    },
  });

  const store = await prisma.store.create({
    data: {
      ownerId: owner.id,
      name: def.name,
      slug: def.slug,
      description: def.description,
      primaryColor: def.primaryColor,
      status: StoreStatus.ACTIVE,
      planId,
      billingCycle: BillingCycle.YEARLY,
      subscriptionStartAt: now,
      subscriptionEndAt,
      businessCategories: def.businessCategories,
      currency: 'SYP',
      codAvailable: true,
    },
  });

  const catByName = new Map<string, { id: string }>();
  for (let i = 0; i < def.categories.length; i++) {
    const name = def.categories[i];
    const created = await prisma.category.create({
      data: { storeId: store.id, name, slug: name, sortOrder: i },
    });
    catByName.set(name, created);
  }

  let created = 0;
  for (const p of def.products) {
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
        soldByWeight: !!p.soldByWeight,
        weightUnit: p.soldByWeight ? p.weightUnit : null,
        minOrderQuantity: p.soldByWeight ? p.minOrderQuantity : null,
        stepQuantity: p.soldByWeight ? p.stepQuantity : null,
        images: {
          create: [
            { url: img(p.keywords, p.lock), sortOrder: 0 },
            { url: img(p.keywords, p.lock + 1), sortOrder: 1 },
          ],
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
        slides: [
          { imageUrl: img(def.heroKeywords, 9001, 1600, 700) },
          { imageUrl: img(def.heroKeywords, 9002, 1600, 700) },
          { imageUrl: img(def.heroKeywords, 9003, 1600, 700) },
        ],
      },
    },
  });

  const sections: { type: string; title: string; sortOrder: number; config?: object }[] = [
    { type: 'FEATURED_PRODUCTS', title: 'منتجات مميزة', sortOrder: 1, config: { limit: 8 } },
    { type: 'NEW_ARRIVALS', title: 'وصل حديثاً', sortOrder: 2 },
    { type: 'BEST_SELLERS', title: 'الأكثر مبيعاً', sortOrder: 3 },
  ];
  for (const s of sections) {
    await prisma.homepageSection.create({
      data: { storeId: store.id, type: s.type as never, title: s.title, sortOrder: s.sortOrder, config: s.config ?? {} },
    });
  }

  console.log(`CREATED store="${def.name}" slug=${def.slug} owner=${def.ownerEmail} products=${created}`);
}

async function main() {
  const plan = await findOrCreatePlan();
  for (const def of STORES) {
    await seedStore(def, plan.id);
  }
  console.log('DONE');
  console.log(`All demo merchant passwords: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
