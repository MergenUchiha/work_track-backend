import { PrismaClient, Orders, Users, OrderAuditLogs } from '@prisma/client';
import { faker } from '@faker-js/faker';

export async function seedOrderAuditLogs(prisma: PrismaClient, orders: Orders[], users: Users[]) {
  const createdLogs: OrderAuditLogs[] = [];

  const actions = [
    'ORDER_CREATED',
    'STATUS_CHANGED',
    'PRIORITY_CHANGED',
    'ASSIGNED',
    'UNASSIGNED',
    'DEADLINE_CHANGED',
    'DESCRIPTION_UPDATED',
    'TITLE_UPDATED',
  ];

  for (const order of orders) {
    // 1 to 5 audit entries per order
    const logsCount = faker.number.int({ min: 1, max: 5 });
    let currentDate = new Date(order.createdAt);

    for (let i = 0; i < logsCount; i++) {
      let action: string;
      let oldValue: any = null;
      let newValue: any = null;

      if (i === 0) {
        // The first entry is always the creation event
        action = 'ORDER_CREATED';
        newValue = {
          title: order.title,
          status: 'NEW',
          priority: order.priority,
        };
      } else {
        // Followed by a few random changes
        action = faker.helpers.arrayElement(actions.filter((a) => a !== 'ORDER_CREATED'));

        switch (action) {
          case 'STATUS_CHANGED':
            oldValue = { status: faker.helpers.arrayElement(['NEW', 'IN_PROGRESS']) };
            newValue = { status: faker.helpers.arrayElement(['IN_PROGRESS', 'DONE', 'CANCELLED']) };
            break;

          case 'PRIORITY_CHANGED':
            oldValue = { priority: faker.helpers.arrayElement(['LOW', 'MEDIUM']) };
            newValue = { priority: faker.helpers.arrayElement(['MEDIUM', 'HIGH']) };
            break;

          case 'ASSIGNED':
            oldValue = { assignedToId: null };
            newValue = {
              assignedToId: order.assignedToId || faker.helpers.arrayElement(users).id,
            };
            break;

          case 'UNASSIGNED':
            oldValue = { assignedToId: faker.helpers.arrayElement(users).id };
            newValue = { assignedToId: null };
            break;

          case 'DEADLINE_CHANGED':
            oldValue = { deadline: null };
            newValue = {
              deadline: faker.date.future({ years: 0.5 }).toISOString(),
            };
            break;

          case 'DESCRIPTION_UPDATED':
            oldValue = { description: faker.lorem.sentence() };
            newValue = { description: faker.lorem.paragraph() };
            break;

          case 'TITLE_UPDATED':
            oldValue = { title: faker.lorem.sentence() };
            newValue = { title: order.title };
            break;
        }
      }

      // Space the changes out by 1 hour to 5 days
      currentDate = new Date(
        currentDate.getTime() + faker.number.int({ min: 3600000, max: 432000000 }),
      );

      const changedBy = faker.helpers.arrayElement(users);

      const log = await prisma.orderAuditLogs.create({
        data: {
          action,
          oldValue,
          newValue,
          createdAt: currentDate,
          orderId: order.id,
          changedById: changedBy.id,
        },
      });

      createdLogs.push(log);
    }
  }

  console.log(`  ✓ Created ${createdLogs.length} audit log entries`);
  return createdLogs;
}
