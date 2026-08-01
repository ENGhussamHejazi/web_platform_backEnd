import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role, StoreStatus } from '../../../generated/prisma';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  storeId: string | null;
  storeStatus: StoreStatus | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
