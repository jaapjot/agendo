import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, bearer, resetDatabase } from './helpers.js';

const credentials = { email: 'ana@example.com', password: 'password123' };

/** Extracts the refresh cookie ("agendo_rt=...") from a response. */
function refreshCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith('agendo_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0]!;
}

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('POST /api/auth/register', () => {
  it('creates a client account and returns an access token plus an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Ana',
      email: 'ana@example.com',
      role: 'CLIENT',
      professional: null,
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('creates a professional profile with a URL-friendly slug', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Lucía',
        ...credentials,
        role: 'PROFESSIONAL',
        businessName: 'Estudio Lucía Pérez',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.professional).toEqual({
      slug: 'estudio-lucia-perez',
      businessName: 'Estudio Lucía Pérez',
    });
  });

  it('adds a numeric suffix when the slug is already taken', async () => {
    const body = {
      name: 'Pro',
      password: 'password123',
      role: 'PROFESSIONAL',
      businessName: 'Kine Sur',
    };
    await request(app)
      .post('/api/auth/register')
      .send({ ...body, email: 'one@example.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...body, email: 'two@example.com' });
    expect(res.body.user.professional.slug).toBe('kine-sur-2');
  });

  it('normalises the email and rejects duplicates', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: '  ANA@Example.com ', password: 'password123', role: 'CLIENT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short', role: 'PROFESSIONAL' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((detail: { field: string }) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('requires a business name for professionals', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Pro', ...credentials, role: 'PROFESSIONAL' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('businessName');
  });

  it('never stores the plain-text password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
    expect(user.passwordHash).not.toContain(credentials.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(credentials);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(credentials.email);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, password: 'nope12345' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, email: 'x@example.com' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('protected routes', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(bearer('eyJhbGciOiJIUzI1NiJ9.e30.invalid'));
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const res = await request(app).get('/api/auth/me').set(bearer(reg.body.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(credentials.email);
  });

  it('forbids clients from professional-only routes', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const res = await request(app).get('/api/me/services').set(bearer(reg.body.accessToken));
    expect(res.status).toBe(403);
  });
});

describe('refresh token rotation', () => {
  it('issues a new token pair and invalidates the old refresh token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const firstCookie = refreshCookie(reg);

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(refreshed)).not.toBe(firstCookie);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(replay.status).toBe(401);
  });

  it('revokes the whole session family when an old token is reused later (possible theft)', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const stolenCookie = refreshCookie(reg);
    const legitimate = await request(app).post('/api/auth/refresh').set('Cookie', stolenCookie);
    const legitimateCookie = refreshCookie(legitimate);

    // Simulate the stolen token being replayed well after the grace period.
    await prisma.refreshToken.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const attack = await request(app).post('/api/auth/refresh').set('Cookie', stolenCookie);
    expect(attack.status).toBe(401);

    // The legitimate user's newer token was revoked as well.
    const afterAttack = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', legitimateCookie);
    expect(afterAttack.status).toBe(401);
  });

  it('answers 204 (not an error) when there is no session cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(204);
  });

  it('logout revokes the refresh token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', ...credentials, role: 'CLIENT' });
    const cookie = refreshCookie(reg);
    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});
