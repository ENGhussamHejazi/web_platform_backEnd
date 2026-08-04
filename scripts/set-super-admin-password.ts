/**
 * Resets the platform super admin's password on whatever database
 * DATABASE_URL points at.
 *
 * prisma/seed.ts only ever *creates* the super admin — it returns early if
 * the account already exists, so changing SUPER_ADMIN_PASSWORD in the
 * environment never updates an account that was already seeded with the
 * old/default password. This script closes that gap.
 *
 * Usage (run from inside backend/ so the relative generated-client import
 * resolves):
 *
 *   DATABASE_URL="<prod url>" \
 *   SUPER_ADMIN_EMAIL="admin@souq-syria.com" \
 *   NEW_SUPER_ADMIN_PASSWORD="<strong password>" \
 *   npx ts-node scripts/set-super-admin-password.ts
 */
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@souq-syria.com';
  const password = process.env.NEW_SUPER_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error(
      'عيّن NEW_SUPER_ADMIN_PASSWORD بكلمة مرور لا تقل عن 12 محرفاً قبل تشغيل السكربت.',
    );
  }

  const admin = await prisma.user.findFirst({ where: { email, storeId: null } });
  if (!admin) {
    throw new Error(`لا يوجد حساب مدير منصة بالبريد ${email} على قاعدة البيانات الحالية.`);
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  // Kill every existing session so an already-issued refresh token can't be
  // used to keep the old access going after the rotation.
  const revoked = await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });

  console.log(`تم تحديث كلمة مرور مدير المنصة: ${email}`);
  console.log(`تم إبطال ${revoked.count} جلسة قائمة.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
