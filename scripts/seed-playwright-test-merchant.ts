import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, StoreStatus } from '../generated/prisma';

const prisma = new PrismaClient();
const EMAIL = 'pw-upload-test@souq-syria.com';
const PASSWORD = 'PwTest@12345';

async function main() {
  const existing = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (existing) {
    console.log('Already exists:', EMAIL);
    return;
  }

  const plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { order: 'asc' } });

  const user = await prisma.user.create({
    data: {
      name: 'PW Upload Tester',
      email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: Role.MERCHANT,
    },
  });

  const store = await prisma.store.create({
    data: {
      ownerId: user.id,
      name: 'PW Upload Test Store',
      slug: `pw-upload-test-${Date.now()}`,
      status: StoreStatus.ACTIVE,
      planId: plan?.id,
      billingCycle: plan ? 'MONTHLY' : undefined,
      subscriptionStartAt: plan ? new Date() : undefined,
      subscriptionEndAt: plan ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : undefined,
      businessCategories: ['FASHION'],
    },
  });

  await prisma.category.create({
    data: {
      storeId: store.id,
      name: 'اختبار',
      slug: 'test-category',
    },
  });

  console.log('Created test merchant:', EMAIL, PASSWORD, 'storeId=', store.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
