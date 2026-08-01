import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { sendMessageSchema } from './dto/messaging.schemas';
import type { SendMessageDto } from './dto/messaging.schemas';

@Controller('merchant/messages')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class MerchantMessagesController {
  constructor(private readonly messaging: MessagingService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.messaging.listMessages(this.storeIdOf(user), Role.MERCHANT);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.messaging.unreadCountForMerchant(
      this.storeIdOf(user),
    );
    return { count };
  }

  @Post()
  send(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(
      this.storeIdOf(user),
      user.id,
      Role.MERCHANT,
      dto.body,
    );
  }
}
