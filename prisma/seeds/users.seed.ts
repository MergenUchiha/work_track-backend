import { PrismaClient, UserRole, Users } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

export async function seedUsers(prisma: PrismaClient) {
  const saltRounds = 10;

  // Создаем фиксированных пользователей для тестирования
  const fixedUsers = [
    {
      email: 'admin@example.com',
      name: 'Admin User',
      password: 'admin123',
      role: UserRole.ADMIN,
      isActive: true,
    },
    {
      email: 'manager@example.com',
      name: 'Manager User',
      password: 'manager123',
      role: UserRole.MANAGER,
      isActive: true,
    },
    {
      email: 'worker@example.com',
      name: 'Worker User',
      password: 'worker123',
      role: UserRole.WORKER,
      isActive: true,
    },
  ];

  const createdUsers:Users[] = [];

  // Создаем фиксированных пользователей
  for (const userData of fixedUsers) {
    const user = await prisma.users.create({
      data: {
        email: userData.email,
        name: userData.name,
        passwordHash: await bcrypt.hash(userData.password, saltRounds),
        role: userData.role,
        isActive: userData.isActive,
      },
    });
    createdUsers.push(user);
    console.log(`  ✓ Created user: ${user.email} (${user.role})`);
  }

  // Создаем случайных пользователей с помощью Faker
  const randomUsersCount = 12;
  const roles = [UserRole.MANAGER, UserRole.WORKER];

  for (let i = 0; i < randomUsersCount; i++) {
    const role = faker.helpers.arrayElement(roles);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();

    const user = await prisma.users.create({
      data: {
        email,
        name: `${firstName} ${lastName}`,
        passwordHash: await bcrypt.hash('password123', saltRounds),
        role,
        isActive: faker.datatype.boolean({ probability: 0.9 }), // 90% активны
      },
    });
    createdUsers.push(user);
    console.log(`  ✓ Created user: ${user.email} (${user.role})`);
  }

  return createdUsers;
}