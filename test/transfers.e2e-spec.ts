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

describe('Wallets, transfers and history (e2e)', () => {
  let app: INestApplication;
  let alice: TestUser;
  let bob: TestUser;

  const transfer = (from: TestUser, body: object, idempotencyKey?: string) => {
    const req = request(app.getHttpServer())
      .post(`${API}/transfers`)
      .set('Authorization', `Bearer ${from.token}`);
    if (idempotencyKey) {
      req.set('Idempotency-Key', idempotencyKey);
    }
    return req.send(body);
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    alice = await registerAndLogin(app, 'Alice');
    bob = await registerAndLogin(app, 'Bob');
    await topUp(app, alice.token, 100_000); // 100 TND
  });

  afterAll(async () => {
    await app.close();
  });

  it('moves money between two wallets', async () => {
    const res = await transfer(alice, {
      recipientEmail: bob.email,
      amount: 25_000,
      description: 'Dinner',
    }).expect(201);

    expect(res.body).toMatchObject({
      amount: 25_000,
      amountFormatted: '25.000 TND',
      senderBalanceAfter: 75_000,
      recipient: { email: bob.email },
      description: 'Dinner',
    });
    expect(res.body.reference).toMatch(/^TRX-\d{8}-[0-9A-F]{10}$/);
    expect(await balanceOf(app, alice.token)).toBe(75_000);
    expect(await balanceOf(app, bob.token)).toBe(25_000);
  });

  it('rejects insufficient funds with 422 and changes nothing', async () => {
    const res = await transfer(alice, { recipientEmail: bob.email, amount: 100_001 }).expect(422);

    expect(res.body.message).toBe('Insufficient funds');
    expect(await balanceOf(app, alice.token)).toBe(100_000);
    expect(await balanceOf(app, bob.token)).toBe(0);
  });

  it('rejects a transfer to yourself', async () => {
    await transfer(alice, { recipientEmail: alice.email, amount: 1_000 }).expect(400);
  });

  it('returns 404 for an unknown recipient', async () => {
    await transfer(alice, { recipientEmail: 'ghost@paylite.test', amount: 1_000 }).expect(404);
  });

  it('rejects a non-integer amount (amounts are millimes)', async () => {
    const res = await transfer(alice, { recipientEmail: bob.email, amount: 12.5 }).expect(400);
    expect(res.body.message).toContain('amount must be an integer number');
  });

  it('replays the original transfer for a repeated Idempotency-Key', async () => {
    const first = await transfer(
      alice,
      { recipientEmail: bob.email, amount: 25_000 },
      'order-0001',
    ).expect(201);
    const retry = await transfer(
      alice,
      { recipientEmail: bob.email, amount: 25_000 },
      'order-0001',
    ).expect(200);

    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.reference).toBe(first.body.reference);
    expect(retry.body.senderBalanceAfter).toBe(75_000);
    expect(await balanceOf(app, alice.token)).toBe(75_000); // debited once
  });

  it('rejects an Idempotency-Key reused with a different amount', async () => {
    await transfer(alice, { recipientEmail: bob.email, amount: 25_000 }, 'order-0002').expect(201);

    await transfer(alice, { recipientEmail: bob.email, amount: 30_000 }, 'order-0002').expect(409);
  });

  it('lists history with direction filter and pagination', async () => {
    for (const amount of [1_000, 2_000, 3_000]) {
      await transfer(alice, { recipientEmail: bob.email, amount }).expect(201);
    }

    const sent = await request(app.getHttpServer())
      .get(`${API}/transactions?direction=OUT&limit=2`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(sent.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(sent.body.data[0]).toMatchObject({
      direction: 'OUT',
      amount: 3_000, // newest first
      counterparty: { email: bob.email },
    });

    const deposits = await request(app.getHttpServer())
      .get(`${API}/transactions?type=DEPOSIT`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(deposits.body.meta.total).toBe(1);
    expect(deposits.body.data[0]).toMatchObject({ direction: 'IN', counterparty: null });

    const received = await request(app.getHttpServer())
      .get(`${API}/transactions?direction=IN&minAmount=2000`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(received.body.meta.total).toBe(2);
  });

  it("hides other users' transactions behind a 404", async () => {
    const res = await transfer(alice, { recipientEmail: bob.email, amount: 1_000 }).expect(201);
    const carol = await registerAndLogin(app, 'Carol');

    await request(app.getHttpServer())
      .get(`${API}/transactions/${res.body.reference}`)
      .set('Authorization', `Bearer ${carol.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${API}/transactions/${res.body.reference}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
  });

  describe('admin', () => {
    it('forbids regular users with 403', async () => {
      await request(app.getHttpServer())
        .get(`${API}/admin/transactions`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(403);
    });

    it('freezes a wallet, which then cannot send money', async () => {
      const admin = await createAdmin(app);
      const wallet = await request(app.getHttpServer())
        .get(`${API}/wallets/me`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${API}/admin/wallets/${wallet.body.id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'FROZEN' })
        .expect(200);

      const res = await transfer(alice, { recipientEmail: bob.email, amount: 1_000 }).expect(403);
      expect(res.body.message).toBe('Your wallet is frozen');
    });

    it('lists all transactions and reports a consistent ledger', async () => {
      const admin = await createAdmin(app);
      await transfer(alice, { recipientEmail: bob.email, amount: 40_000 }).expect(201);

      const all = await request(app.getHttpServer())
        .get(`${API}/admin/transactions?type=TRANSFER`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(all.body.data[0]).toMatchObject({
        amount: 40_000,
        from: { email: alice.email },
        to: { email: bob.email },
      });

      const report = await request(app.getHttpServer())
        .get(`${API}/admin/reconcile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(report.body).toMatchObject({ consistent: true, walletsChecked: 3, mismatches: [] });
    });
  });
});
