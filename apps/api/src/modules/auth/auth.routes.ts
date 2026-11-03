import { Router, type CookieOptions, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env, isProduction } from '../../config/env.js';
import { authenticate, currentUser } from '../../middleware/authenticate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const REFRESH_COOKIE = 'agendo_rt';

/**
 * The refresh token lives in an httpOnly cookie: JavaScript (and therefore an XSS attack)
 * cannot read it. SameSite=Strict + a narrow path mean the browser only sends it to the
 * auth endpoints of this same site.
 */
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

// Slows down password guessing. Disabled in tests, which log in many times quickly.
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again in a few minutes' },
  },
});

function sendSession(res: Response, session: authService.AuthSession, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
}

export const authRouter = Router();

authRouter.post('/register', credentialsLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  sendSession(res, await authService.register(input), 201);
});

authRouter.post('/login', credentialsLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  sendSession(res, await authService.login(email, password));
});

authRouter.post('/refresh', async (req, res) => {
  // No cookie simply means "not logged in" (a normal state for visitors), not an error.
  if (!req.cookies?.[REFRESH_COOKIE]) {
    res.status(204).end();
    return;
  }
  try {
    sendSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE]));
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    throw error;
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ user: await authService.getCurrentUser(currentUser(req).id) });
});
