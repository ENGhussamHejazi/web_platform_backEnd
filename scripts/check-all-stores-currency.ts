import { PrismaClient } from '../generated/prisma';
const prisma = new PrismaClient();

(async () => {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, currency: true, usdToSypRate: true, status: true },
  });
  for (const s of stores) {
    console.log(s.name, '|', s.status, '| currency=', s.currency, '| rate=', s.usdToSypRate?.toString());
  }
  console.log('Total stores:', stores.length);
  await prisma.$disconnect();
})();
