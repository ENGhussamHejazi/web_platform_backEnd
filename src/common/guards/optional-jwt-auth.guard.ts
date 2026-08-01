import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Runs the same passport-jwt strategy as JwtAuthGuard, but never rejects the
// request — used on endpoints that must stay reachable by guests while still
// picking up `req.user` when a valid token is present (e.g. so a logged-in
// customer's order gets linked to their account).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user ?? (null as TUser);
  }
}
