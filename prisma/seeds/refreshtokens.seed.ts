import { PrismaClient, RefreshTokens, Users } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as crypto from 'crypto';

export async function seedRefreshTokens(prisma: PrismaClient, users: Users[]) {
  const createdTokens: RefreshTokens[] = [];

  // 0 to 3 refresh tokens per active user
  for (const user of users) {
    if (!user.isActive) continue;

    const tokensCount = faker.number.int({ min: 0, max: 3 });

    for (let i = 0; i < tokensCount; i++) {
      // Random token plus the hash that would be stored
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // 70% of the tokens are still valid, 30% have expired
      const isExpired = faker.datatype.boolean({ probability: 0.3 });

      let expiresAt: Date;
      if (isExpired) {
        // Expired 1 to 30 days ago
        expiresAt = faker.date.recent({ days: 30 });
      } else {
        // Valid for up to 30 more days
        expiresAt = faker.date.soon({ days: 30 });
      }

      // Some tokens are revoked
      const revoked = faker.datatype.boolean({ probability: 0.2 });

      // Issued 1 to 60 days ago
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
