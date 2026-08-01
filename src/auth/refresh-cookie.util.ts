import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import ms from 'ms';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Refresh tokens live in an httpOnly cookie, never in the JSON body — the
 * frontend previously kept them in localStorage, which meant any XSS on the
 * site handed over a long-lived (7d) session instead of just the short-lived
 * access token. `path` is scoped to /api/auth so the cookie isn't replayed
 * on every request, only the ones that need it.
 */
export function setRefreshCookie(
  res: Response,
  config: ConfigService,
  token: string,
) {
  const refreshTtl = config.get<string>('jwt.refreshTtl') ?? '7d';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.get<string>('nodeEnv') === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: ms(refreshTtl as ms.StringValue),
  });
}

export function clearRefreshCookie(res: Response, config: ConfigService) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.get<string>('nodeEnv') === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

/** Strips the refresh token out of an AuthService response before it goes over the wire. */
export function omitRefreshToken<T extends { refreshToken: string }>(
  data: T,
): Omit<T, 'refreshToken'> {
  const { refreshToken: _refreshToken, ...rest } = data;
  return rest;
}
