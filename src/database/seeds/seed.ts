import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from '../../modules/auth/auth.service';
import { User } from '../../modules/users/user.entity';
import { WalletsService } from '../../modules/wallets/wallets.service';

/** Demo accounts listed in the README. Safe to run several times. */
const DEMO_PASSWORD = 'Passw0rd!';
const DEMO_USERS = [
  { fullName: 'PayLite Admin', email: 'admin@paylite.tn', role: Role.ADMIN, deposit: 0 },
  { fullName: 'Alice Ben Salah', email: 'alice@paylite.tn', role: Role.USER, deposit: 500_000 },
  { fullName: 'Bob Trabelsi', email: 'bob@paylite.tn', role: Role.USER, deposit: 150_000 },
];

async function seed(): Promise<void> {
  const logger = new Logger('Seed');
  // Reuses the real services, so seeded data goes through the same rules and ledger.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const auth = app.get(AuthService);
    const wallets = app.get(WalletsService);
    const users = app.get(DataSource).getRepository(User);

    for (const demo of DEMO_USERS) {
      if (await users.existsBy({ email: demo.email })) {
        logger.log(`${demo.email} already exists, skipped`);
        continue;
      }
      const profile = await auth.register({
        fullName: demo.fullName,
        email: demo.email,
        password: DEMO_PASSWORD,
      });
      if (demo.role !== Role.USER) {
        await users.update(profile.id, { role: demo.role });
      }
      if (demo.deposit > 0) {
        await wallets.deposit(profile.id, { amount: demo.deposit, description: 'Seed balance' });
      }
      logger.log(`Created ${demo.role} ${demo.email}`);
    }
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
