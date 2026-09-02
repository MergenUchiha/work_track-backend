import { PrismaClient, OrderStatus, OrderPriority, Users, Orders } from '@prisma/client';
import { faker } from '@faker-js/faker';

export async function seedOrders(prisma: PrismaClient, users: Users[]) {
  const createdOrders: Orders[] = [];
  const ordersCount = 50;

  const statuses = Object.values(OrderStatus);
  const priorities = Object.values(OrderPriority);

  // Split users by role
  const managers = users.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN');
  const workers = users.filter((u) => u.role === 'WORKER');

  const orderTitleTemplates = [
    'Build the {feature} module',
    'Fix a bug in the {module}',
    'Optimise the {component}',
    'Refactor the {system}',
    'Adopt {technology}',
    'Document the {feature}',
    'Test the {module}',
    'Integrate with {service}',
    'Set up {infrastructure}',
    'Migrate {data}',
  ];

  const features = [
    'authentication',
    'authorisation',
    'reporting',
    'notifications',
    'payments',
    'search',
    'filtering',
    'data export',
    'data import',
    'dashboard',
  ];

  const modules = [
    'orders API',
    'logging system',
    'database',
    'user interface',
    'mobile app',
    'admin panel',
    'security module',
    'caching layer',
  ];

  for (let i = 0; i < ordersCount; i++) {
    const status = faker.helpers.arrayElement(statuses);
    const priority = faker.helpers.arrayElement(priorities);
    const creator = faker.helpers.arrayElement(managers);

    // 70% of orders have an assignee
    const shouldAssign = faker.datatype.boolean({ probability: 0.7 });
    const assignedTo =
      shouldAssign && workers.length > 0 ? faker.helpers.arrayElement(workers) : null;

    const template = faker.helpers.arrayElement(orderTitleTemplates);
    const feature = faker.helpers.arrayElement(features);
    const module = faker.helpers.arrayElement(modules);
    const title = template
      .replace('{feature}', feature)
      .replace('{module}', module)
      .replace('{component}', feature)
      .replace('{system}', module)
      .replace('{technology}', feature)
      .replace('{service}', faker.company.name())
      .replace('{infrastructure}', feature)
      .replace('{data}', module);

    // 80% of orders have a deadline
    const hasDeadline = faker.datatype.boolean({ probability: 0.8 });
    const deadline = hasDeadline
      ? faker.date.between({
          from: new Date(),
          to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // +90 days
        })
      : null;

    // Spread creation dates over the last 60 days
    const createdAt = faker.date.recent({ days: 60 });

    const order = await prisma.orders.create({
      data: {
        title,
        description: faker.datatype.boolean({ probability: 0.8 })
          ? faker.lorem.paragraph({ min: 1, max: 3 })
          : null,
        status,
        priority,
        deadline,
        createdAt,
        createdById: creator.id,
        assignedToId: assignedTo?.id || null,
      },
    });

    createdOrders.push(order);
    console.log(`  ✓ Created order: ${order.title.substring(0, 50)}... (${order.status})`);
  }

  return createdOrders;
}
