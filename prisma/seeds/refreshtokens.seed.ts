import { PrismaClient, RefreshTokens, Users } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as crypto from 'crypto';

export async function seedRefreshTokens(prisma: PrismaClient, users: Users[]) {
  const createdTokens: RefreshTokens[] = [];

  // Для активных пользователей создаем от 0 до 3 refresh токенов
  for (const user of users) {
    if (!user.isActive) continue;

    const tokensCount = faker.number.int({ min: 0, max: 3 });

    for (let i = 0; i < tokensCount; i++) {
      // Генерируем случайный токен и его хеш
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Определяем срок действия токена
      // 70% токенов валидны, 30% просрочены
      const isExpired = faker.datatype.boolean({ probability: 0.3 });
      
      let expiresAt: Date;
      if (isExpired) {
        // Просроченный токен (от 1 до 30 дней назад)
        expiresAt = faker.date.recent({ days: 30 });
      } else {
        // Валидный токен (от текущего момента до 30 дней вперед)
        expiresAt = faker.date.soon({ days: 30 });
      }

      // Некоторые токены могут быть отозваны
      const revoked = faker.datatype.boolean({ probability: 0.2 });

      // Дата создания токена (от 1 до 60 дней назад)
      const createdAt = faker.date.recent({ days: 60 });

      const refreshToken = await prisma.refreshTokens.create({
        data: {
          tokenHash,
          expiresAt,
          revoked,
          createdAt,
          userId: user.id,
        },
      });

      createdTokens.push(refreshToken);
    }
  }

  console.log(`  ✓ Created ${createdTokens.length} refresh tokens`);
  return createdTokens;
}