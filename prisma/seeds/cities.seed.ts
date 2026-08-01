import { Governorate, PrismaClient } from '../../generated/prisma';

/**
 * Starter list of Syrian cities/towns/delivery areas per governorate.
 * Not exhaustive — Super Admin can add/correct entries from the dashboard
 * without a code change (see LocationsModule).
 */
export const CITIES_BY_GOVERNORATE: Record<
  Governorate,
  { nameAr: string; nameEn: string }[]
> = {
  DAMASCUS: [
    { nameAr: 'المزة', nameEn: 'Al-Mazzeh' },
    { nameAr: 'باب توما', nameEn: 'Bab Touma' },
    { nameAr: 'الشعلان', nameEn: 'Al-Shaalan' },
    { nameAr: 'كفرسوسة', nameEn: 'Kafr Sousa' },
    { nameAr: 'دمر', nameEn: 'Dummar' },
    { nameAr: 'برزة', nameEn: 'Barzeh' },
    { nameAr: 'القابون', nameEn: 'Al-Qaboun' },
    { nameAr: 'جوبر', nameEn: 'Jobar' },
    { nameAr: 'الميدان', nameEn: 'Al-Midan' },
    { nameAr: 'الشاغور', nameEn: 'Al-Shaghour' },
    { nameAr: 'ركن الدين', nameEn: 'Rukn al-Din' },
    { nameAr: 'المهاجرين', nameEn: 'Al-Muhajireen' },
  ],
  RIF_DIMASHQ: [
    { nameAr: 'جرمانا', nameEn: 'Jaramana' },
    { nameAr: 'صحنايا', nameEn: 'Sahnaya' },
    { nameAr: 'أشرفية صحنايا', nameEn: 'Ashrafiyat Sahnaya' },
    { nameAr: 'قدسيا', nameEn: 'Qudsaya' },
    { nameAr: 'التل', nameEn: 'Al-Tall' },
    { nameAr: 'دوما', nameEn: 'Douma' },
    { nameAr: 'حرستا', nameEn: 'Harasta' },
    { nameAr: 'داريا', nameEn: 'Darayya' },
    { nameAr: 'معضمية الشام', nameEn: 'Muadamiyat Al-Sham' },
    { nameAr: 'قطنا', nameEn: 'Qatana' },
    { nameAr: 'يبرود', nameEn: 'Yabroud' },
    { nameAr: 'النبك', nameEn: 'An-Nabk' },
    { nameAr: 'الزبداني', nameEn: 'Zabadani' },
    { nameAr: 'بلودان', nameEn: 'Bloudan' },
    { nameAr: 'دير عطية', nameEn: 'Deir Atiyah' },
    { nameAr: 'صيدنايا', nameEn: 'Saidnaya' },
    { nameAr: 'معلولا', nameEn: 'Maaloula' },
    { nameAr: 'الكسوة', nameEn: 'Al-Kiswah' },
    { nameAr: 'حمورية', nameEn: 'Hammouriyeh' },
    { nameAr: 'عربين', nameEn: 'Arbin' },
  ],
  ALEPPO: [
    { nameAr: 'حلب المدينة', nameEn: 'Aleppo City' },
    { nameAr: 'أعزاز', nameEn: 'Azaz' },
    { nameAr: 'منبج', nameEn: 'Manbij' },
    { nameAr: 'الباب', nameEn: 'Al-Bab' },
    { nameAr: 'عفرين', nameEn: 'Afrin' },
    { nameAr: 'جرابلس', nameEn: 'Jarablus' },
    { nameAr: 'السفيرة', nameEn: 'Al-Safira' },
    { nameAr: 'دير حافر', nameEn: 'Deir Hafer' },
    { nameAr: 'عين العرب', nameEn: 'Ain al-Arab' },
  ],
  HOMS: [
    { nameAr: 'حمص المدينة', nameEn: 'Homs City' },
    { nameAr: 'تدمر', nameEn: 'Palmyra' },
    { nameAr: 'الرستن', nameEn: 'Al-Rastan' },
    { nameAr: 'تلبيسة', nameEn: 'Talbiseh' },
    { nameAr: 'القصير', nameEn: 'Al-Qusayr' },
    { nameAr: 'تلكلخ', nameEn: 'Talkalakh' },
    { nameAr: 'المخرم', nameEn: 'Al-Makhram' },
  ],
  HAMA: [
    { nameAr: 'حماة المدينة', nameEn: 'Hama City' },
    { nameAr: 'مصياف', nameEn: 'Masyaf' },
    { nameAr: 'سلمية', nameEn: 'Salamiyah' },
    { nameAr: 'محردة', nameEn: 'Mahardah' },
    { nameAr: 'السقيلبية', nameEn: 'Suqaylabiyah' },
    { nameAr: 'كفربهم', nameEn: 'Kafr Buhum' },
  ],
  LATAKIA: [
    { nameAr: 'اللاذقية المدينة', nameEn: 'Latakia City' },
    { nameAr: 'جبلة', nameEn: 'Jableh' },
    { nameAr: 'القرداحة', nameEn: 'Qardaha' },
    { nameAr: 'الحفة', nameEn: 'Al-Haffah' },
    { nameAr: 'كسب', nameEn: 'Kassab' },
  ],
  TARTUS: [
    { nameAr: 'طرطوس المدينة', nameEn: 'Tartus City' },
    { nameAr: 'بانياس', nameEn: 'Baniyas' },
    { nameAr: 'صافيتا', nameEn: 'Safita' },
    { nameAr: 'دريكيش', nameEn: 'Dreikish' },
    { nameAr: 'الشيخ بدر', nameEn: 'Sheikh Badr' },
    { nameAr: 'الحميدية', nameEn: 'Al-Hamidiyah' },
  ],
  IDLIB: [
    { nameAr: 'إدلب المدينة', nameEn: 'Idlib City' },
    { nameAr: 'معرة النعمان', nameEn: 'Maarat al-Numan' },
    { nameAr: 'جسر الشغور', nameEn: 'Jisr al-Shughur' },
    { nameAr: 'أريحا', nameEn: 'Ariha' },
    { nameAr: 'سراقب', nameEn: 'Saraqib' },
    { nameAr: 'خان شيخون', nameEn: 'Khan Shaykhun' },
    { nameAr: 'بنش', nameEn: 'Binnish' },
  ],
  DEIR_EZ_ZOR: [
    { nameAr: 'دير الزور المدينة', nameEn: 'Deir ez-Zor City' },
    { nameAr: 'الميادين', nameEn: 'Al-Mayadin' },
    { nameAr: 'البوكمال', nameEn: 'Al-Bukamal' },
    { nameAr: 'الشحيل', nameEn: 'Al-Shuhayl' },
  ],
  RAQQA: [
    { nameAr: 'الرقة المدينة', nameEn: 'Raqqa City' },
    { nameAr: 'الطبقة', nameEn: 'Al-Tabqah' },
    { nameAr: 'تل أبيض', nameEn: 'Tell Abyad' },
    { nameAr: 'الكرامة', nameEn: 'Al-Karama' },
  ],
  HASAKAH: [
    { nameAr: 'الحسكة المدينة', nameEn: 'Al-Hasakah City' },
    { nameAr: 'القامشلي', nameEn: 'Qamishli' },
    { nameAr: 'رأس العين', nameEn: 'Ras al-Ain' },
    { nameAr: 'المالكية', nameEn: 'Al-Malikiyah' },
    { nameAr: 'عامودا', nameEn: 'Amuda' },
    { nameAr: 'الشدادي', nameEn: 'Al-Shaddadi' },
  ],
  DARAA: [
    { nameAr: 'درعا المدينة', nameEn: 'Daraa City' },
    { nameAr: 'نوى', nameEn: 'Nawa' },
    { nameAr: 'الصنمين', nameEn: 'Al-Sanamayn' },
    { nameAr: 'إزرع', nameEn: 'Izra' },
    { nameAr: 'بصرى الشام', nameEn: 'Bosra' },
    { nameAr: 'جاسم', nameEn: 'Jasim' },
    { nameAr: 'طفس', nameEn: 'Tafas' },
  ],
  SWEIDA: [
    { nameAr: 'السويداء المدينة', nameEn: 'Sweida City' },
    { nameAr: 'شهبا', nameEn: 'Shahba' },
    { nameAr: 'صلخد', nameEn: 'Salkhad' },
    { nameAr: 'عرمان', nameEn: 'Arman' },
    { nameAr: 'قنوات', nameEn: 'Qanawat' },
  ],
  QUNEITRA: [
    { nameAr: 'القنيطرة المدينة', nameEn: 'Quneitra City' },
    { nameAr: 'خان أرنبة', nameEn: 'Khan Arnabah' },
    { nameAr: 'جباتا الخشب', nameEn: 'Jubata al-Khashab' },
  ],
};

export function slugify(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function seedCities(prisma: PrismaClient) {
  let count = 0;
  for (const [governorate, cities] of Object.entries(CITIES_BY_GOVERNORATE) as [
    Governorate,
    { nameAr: string; nameEn: string }[],
  ][]) {
    for (const [index, city] of cities.entries()) {
      const slug = slugify(city.nameEn);
      await prisma.city.upsert({
        where: { governorate_slug: { governorate, slug } },
        update: { nameAr: city.nameAr, nameEn: city.nameEn },
        create: {
          governorate,
          nameAr: city.nameAr,
          nameEn: city.nameEn,
          slug,
          displayOrder: index,
        },
      });
      count += 1;
    }
  }
  console.log(`تم زرع ${count} مدينة/منطقة توصيل`);
}
