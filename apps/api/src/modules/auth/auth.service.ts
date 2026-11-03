import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma, Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens.js';
import type { RegisterInput } from './auth.schemas.js';
import { slugify } from './slug.js';

const BCRYPT_ROUNDS = 12;
/**
 * Two browser tabs can refresh at the same moment with the same cookie. A token revoked
 * this recently is treated as that harmless race, not as theft.
 */
const REUSE_GRACE_PERIOD_MS = 30_000;

// Used so a login with an unknown email takes as long as one with a wrong password
// (otherwise response time would reveal which emails are registered).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const userWithProfile = {
  id: true,
  name: true,
  email: true,
  role: true,
  professionalProfile: { select: { slug: true, businessName: true } },
} satisfies Prisma.UserSelect;

type UserWithProfile = Prisma.UserGetPayload<{ select: typeof userWithProfile }>;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  professional: { slug: string; businessName: string } | null;
}

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function toPublicUser(user: UserWithProfile): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    professional: user.professionalProfile,
  };
}

async function findAvailableSlug(base: string, tx: Prisma.TransactionClient): Promise<string> {
  const root = base || 'profesional';
  const taken = await tx.professionalProfile.findMany({
    where: { slug: { startsWith: root } },
    select: { slug: true },
  });
  const takenSet = new Set(taken.map((profile) => profile.slug));
  if (!takenSet.has(root)) return root;
  let suffix = 2;
  while (takenSet.has(`${root}-${suffix}`)) suffix += 1;
  return `${root}-${suffix}`;
}

async function issueSession(
  user: UserWithProfile,
  familyId: string = randomUUID(),
): Promise<AuthSession> {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return {
    user: toPublicUser(user),
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
  };
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('EMAIL_TAKEN', 'An account with that email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: input.role },
    });
    if (input.role === 'PROFESSIONAL' && input.businessName) {
      await tx.professionalProfile.create({
        data: {
          userId: created.id,
          businessName: input.businessName,
          slug: await findAvailableSlug(slugify(input.businessName), tx),
        },
      });
    }
    return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: userWithProfile });
  });

  return issueSession(user);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...userWithProfile, passwordHash: true },
  });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    // Same message for both cases: do not reveal whether the email exists.
    throw unauthorized('Invalid email or password');
  }
  return issueSession(user);
}

/**
 * Refresh token rotation: every refresh consumes the old token and issues a new one.
 * If an already-used token shows up again, someone may have stolen it, so the whole
 * family (every token descended from that login) is revoked and the user must log in again.
 */
export async function refresh(presentedToken: string | undefined): Promise<AuthSession> {
  if (!presentedToken) throw unauthorized('No session');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presentedToken) },
    include: { user: { select: userWithProfile } },
  });
  if (!stored) throw unauthorized('Invalid session');

  if (stored.revokedAt) {
    const revokedRecently = Date.now() - stored.revokedAt.getTime() < REUSE_GRACE_PERIOD_MS;
    if (!revokedRecently) {
      await prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized('Session expired, please log in again');
  }
  if (stored.expiresAt < new Date()) throw unauthorized('Session expired, please log in again');

  // Conditional update: if two requests race with the same token, only one wins.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw unauthorized('Session expired, please log in again');

  return issueSession(stored.user, stored.familyId);
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presentedToken) },
  });
  if (!stored) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: stored.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userWithProfile });
  if (!user) throw unauthorized('Account no longer exists');
  return toPublicUser(user);
}
