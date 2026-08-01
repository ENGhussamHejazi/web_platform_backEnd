import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { CustomerChatService } from './customer-chat.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireActiveStore } from '../common/decorators/require-active-store.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { sendCustomerMessageSchema } from './dto/customer-chat.schemas';
import type { SendCustomerMessageDto } from './dto/customer-chat.schemas';

@Controller('merchant/customer-chats')
@Roles(Role.MERCHANT)
@RequireActiveStore()
export class MerchantCustomerChatController {
  constructor(private readonly customerChat: CustomerChatService) {}

  private storeIdOf(user: AuthUser): string {
    if (!user.storeId) {
      throw new ForbiddenException('لا يوجد متجر مرتبط بهذا الحساب');
    }
    return user.storeId;
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.customerChat.listConversationsForMerchant(this.storeIdOf(user));
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.customerChat.unreadCountForMerchant(this.storeIdOf(user));
    return { count };
  }

  @Get(':customerId')
  thread(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    return this.customerChat.listMessages(this.storeIdOf(user), customerId, Role.MERCHANT);
  }

  @Post(':customerId')
  send(
    @CurrentUser() user: AuthUser,
    @Param('customerId') customerId: string,
    @Body(new ZodValidationPipe(sendCustomerMessageSchema)) dto: SendCustomerMessageDto,
  ) {
    return this.customerChat.sendMessage(
      this.storeIdOf(user),
      customerId,
      user.id,
      Role.MERCHANT,
      dto.body,
    );
  }
}
