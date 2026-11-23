import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  API,
  balanceOf,
  createAdmin,
  createTestApp,
  registerAndLogin,
  resetDatabase,
  TestUser,
  topUp,
} from './utils/test-app';

/**
 * The tests that matter most for a wallet: real parallel HTTP requests against a real
 * MySQL. Without row locking, several requests would read the same balance and the
 * wallet would go negative or pay the same request twice.
 */
describe('Concurrency (e2e)', () => {
  let app: INestApplication;
  let alice: TestUser;
  let bob: TestUser;

  const send = (amount: number, idempotencyKey?: string) => {
    const req = request(app.getHttpServer())
      .post(`${API}/transfers`)
      .set('Authorization', `Bearer ${alice.token}`);
    if (idempotencyKey) {
      req.set('Idempotency-Key', idempotencyKey);
    }
    return req.send({ recipientEmail: bob.email, amount });
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    alice = await registerAndLogin(app, 'Alice');
    bob = await registerAndLogin(app, 'Bob');
  });

  afterAll(async () => {
    await app.close();
  });

  it('never overdraws a wallet under 20 simultaneous transfers', async () => {
    await topUp(app, alice.token, 100_000); // 100 TND

    // 20 x 10 TND at the same time: exactly 10 can succeed.
    const responses = await Promise.all(Array.from({ length: 20 }, () => send(10_000)));
    const statuses = responses.map((res) => res.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    expect(statuses.filter((status) => status === 422)).toHaveLength(10);
    expect(await balanceOf(app, alice.token)).toBe(0);
    expect(await balanceOf(app, bob.token)).toBe(100_000);

    const admin = await createAdmin(app);
    const report = await request(app.getHttpServer())
      .get(`${API}/admin/reconcile`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(report.body.consistent).toBe(true);
  });

  it('creates exactly one transfer when the same Idempotency-Key arrives 5 times at once', async () => {
    await topUp(app, alice.token, 100_000);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => send(10_000, 'pay-rent-nov')),
    );
    const statuses = responses.map((res) => res.status).sort();

    expect(statuses).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((res) => res.body.reference)).size).toBe(1);
    expect(await balanceOf(app, alice.token)).toBe(90_000);
  });

  it('does not deadlock when two users pay each other at the same time', async () => {
    await topUp(app, alice.token, 50_000);
    await topUp(app, bob.token, 50_000);

    const aliceToBob = Array.from({ length: 10 }, () => send(1_000));
    const bobToAlice = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post(`${API}/transfers`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ recipientEmail: alice.email, amount: 1_000 }),
    );
    const responses = await Promise.all([...aliceToBob, ...bobToAlice]);

    expect(responses.every((res) => res.status === 201)).toBe(true);
    expect(await balanceOf(app, alice.token)).toBe(50_000);
    expect(await balanceOf(app, bob.token)).toBe(50_000);
  });
});
