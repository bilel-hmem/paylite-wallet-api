import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { API_PREFIX, configureApp } from '../../src/app.setup';
import { Role } from '../../src/common/enums/role.enum';
import { User } from '../../src/modules/users/user.entity';

export const API = `/${API_PREFIX}`;
export const PASSWORD = 'Passw0rd!';

export interface TestUser {
  id: number;
  email: string;
  token: string;
}

/** Same pipes, filters and prefix as production. Listens on a random port. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  // Listening (instead of init) lets supertest fire many requests in parallel.
  await app.listen(0);
  return app;
}

/** Empties every table between tests. Refuses to run on a non-test database. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const database = String(dataSource.options.database);
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to truncate tables in "${database}"`);
  }
  const runner = dataSource.createQueryRunner();
  try {
    await runner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['ledger_entries', 'transactions', 'wallets', 'users']) {
      await runner.query(`TRUNCATE TABLE \`${table}\``);
    }
    await runner.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await runner.release();
  }
}

export async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken;
}

export async function registerAndLogin(app: INestApplication, name: string): Promise<TestUser> {
  const email = `${name.toLowerCase()}@paylite.test`;
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/register`)
    .send({ fullName: name, email, password: PASSWORD })
    .expect(201);
  return { id: res.body.id, email, token: await login(app, email) };
}

/** The role lives in the JWT, so the admin logs in again after being promoted. */
export async function createAdmin(app: INestApplication): Promise<TestUser> {
  const user = await registerAndLogin(app, 'Admin');
  await app.get(DataSource).getRepository(User).update(user.id, { role: Role.ADMIN });
  return { ...user, token: await login(app, user.email) };
}

export async function topUp(app: INestApplication, token: string, amount: number): Promise<void> {
  await request(app.getHttpServer())
    .post(`${API}/wallets/me/deposits`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount })
    .expect(201);
}

export async function balanceOf(app: INestApplication, token: string): Promise<number> {
  const res = await request(app.getHttpServer())
    .get(`${API}/wallets/me`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.balance;
}
