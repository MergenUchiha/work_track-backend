import { PrismaClient } from '@prisma/client';
import { seedUsers } from './seeds/users.seed';
import { seedOrders } from './seeds/orders.seed';
import { seedOrderAuditLogs } from './seeds/orderauditlogs.seed';
import { seedRefreshTokens } from './seeds/refreshtokens.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // Очищаем данные в правильном порядке (учитывая зависимости)
    console.log('🧹 Cleaning existing data...');
    await prisma.orderAuditLogs.deleteMany();
    await prisma.refreshTokens.deleteMany();
    await prisma.orders.deleteMany();
    await prisma.users.deleteMany();

    // Заполняем данные
    console.log('👥 Seeding users...');
    const users = await seedUsers(prisma);

    console.log('📦 Seeding orders...');
    const orders = await seedOrders(prisma, users);

    console.log('📝 Seeding order audit logs...');
    await seedOrderAuditLogs(prisma, orders, users);

    console.log('🔑 Seeding refresh tokens...');
    await seedRefreshTokens(prisma, users);

    console.log('✅ Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });