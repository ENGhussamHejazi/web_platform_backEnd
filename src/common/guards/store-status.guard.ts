import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_ACTIVE_STORE_KEY } from '../decorators/require-active-store.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class StoreStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresActiveStore = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_ACTIVE_STORE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresActiveStore) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser;
    if (!user || user.storeStatus !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'STORE_NOT_ACTIVE',
        status: user?.storeStatus ?? null,
        message: 'متجرك غير مفعّل بعد، لا يمكنك الوصول إلى هذا المورد',
      });
    }
    return true;
  }
}
