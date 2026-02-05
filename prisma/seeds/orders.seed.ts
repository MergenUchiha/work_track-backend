import { PrismaClient, OrderStatus, OrderPriority, Users, Orders } from '@prisma/client';
import { faker } from '@faker-js/faker';

export async function seedOrders(prisma: PrismaClient, users: Users[]) {
  const createdOrders:Orders[] = [];
  const ordersCount = 50;

  const statuses = Object.values(OrderStatus);
  const priorities = Object.values(OrderPriority);

  // Фильтруем пользователей по ролям
  const managers = users.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN');
  const workers = users.filter((u) => u.role === 'WORKER');

  const orderTitleTemplates = [
    'Разработка модуля {feature}',
    'Исправление бага в {module}',
    'Оптимизация {component}',
    'Рефакторинг {system}',
    'Внедрение {technology}',
    'Создание документации для {feature}',
    'Тестирование {module}',
    'Интеграция с {service}',
    'Настройка {infrastructure}',
    'Миграция {data}',
  ];

  const features = [
    'аутентификации',
    'авторизации',
    'отчетности',
    'уведомлений',
    'платежей',
    'поиска',
    'фильтрации',
    'экспорта данных',
    'импорта данных',
    'dashboard',
  ];

  const modules = [
    'API заказов',
    'системе логирования',
    'базе данных',
    'пользовательском интерфейсе',
    'мобильном приложении',
    'админ-панели',
    'модуле безопасности',
    'системе кэширования',
  ];

  for (let i = 0; i < ordersCount; i++) {
    const status = faker.helpers.arrayElement(statuses);
    const priority = faker.helpers.arrayElement(priorities);
    const creator = faker.helpers.arrayElement(managers);
    
    // 70% заказов назначены кому-то
    const shouldAssign = faker.datatype.boolean({ probability: 0.7 });
    const assignedTo = shouldAssign && workers.length > 0
      ? faker.helpers.arrayElement(workers)
      : null;

    // Генерируем заголовок
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

    // Генерируем дедлайн (80% заказов имеют дедлайн)
    const hasDeadline = faker.datatype.boolean({ probability: 0.8 });
    const deadline = hasDeadline
      ? faker.date.between({
          from: new Date(),
          to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // +90 дней
        })
      : null;

    // Генерируем даты создания (за последние 60 дней)
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