import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, createTestApp, PASSWORD, registerAndLogin, resetDatabase } from './utils/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user with an empty TND wallet and never returns the password', async () => {
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .send({ fullName: 'Alice', email: '  Alice@PayLite.test ', password: PASSWORD })
      .expect(201);

    expect(res.body).toMatchObject({
      email: 'alice@paylite.test',
      role: 'USER',
      wallet: { balance: 0, currency: 'TND', status: 'ACTIVE' },
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email with 409', async () => {
    await registerAndLogin(app, 'Alice');

    const res = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .send({ fullName: 'Alice Again', email: 'ALICE@paylite.test', password: PASSWORD })
      .expect(409);

    expect(res.body.message).toBe('Email is already registered');
  });

  it('returns every validation error in a consistent error body', async () => {
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .send({ fullName: 'A', email: 'not-an-email', password: 'short', role: 'ADMIN' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: `${API}/auth/register`,
    });
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'property role should not exist',
        'email must be an email',
        'fullName must be longer than or equal to 2 characters',
      ]),
    );
  });

  it('logs in and returns a bearer token', async () => {
    await registerAndLogin(app, 'Alice');

    const res = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: 'alice@paylite.test', password: PASSWORD })
      .expect(200);

    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600 });
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with 401', async () => {
    await registerAndLogin(app, 'Alice');

    await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: 'alice@paylite.test', password: 'Wr0ngPassword' })
      .expect(401);
  });

  it('protects /auth/me with the JWT guard', async () => {
    const alice = await registerAndLogin(app, 'Alice');

    await request(app.getHttpServer()).get(`${API}/auth/me`).expect(401);
    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Authorization', 'Bearer not.a.token')
      .expect(401);

    const res = await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(res.body).toMatchObject({ email: alice.email, wallet: { balance: 0 } });
  });

  it('exposes a public health check', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});
