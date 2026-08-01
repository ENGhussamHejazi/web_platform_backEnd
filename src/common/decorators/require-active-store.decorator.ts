import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ACTIVE_STORE_KEY = 'requireActiveStore';
export const RequireActiveStore = () =>
  SetMetadata(REQUIRE_ACTIVE_STORE_KEY, true);
