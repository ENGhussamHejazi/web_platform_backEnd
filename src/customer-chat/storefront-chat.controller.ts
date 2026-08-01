import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CustomerChatService } from './customer-chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { sendCustomerMessageSchema } from './dto/customer-chat.schemas';
import type { SendCustomerMessageDto } from './dto/customer-chat.schemas';

// Not @Public() at the class level (mirrors CustomerAccountController) so
// every route here defaults to requiring auth; @Roles(CUSTOMER) narrows it.
@Controller('public/stores/:slug/chat')
@Roles(Role.CUSTOMER)
export class StorefrontChatController {
  constructor(
    private readonly customerChat: CustomerChatService,
    private readonly prisma: PrismaService,
  ) {}

  private async storeIdOf(slug: string, user: AuthUser): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('المتجر غير موجود');
    if (user.role !== Role.CUSTOMER || user.storeId !== store.id) {
      throw new ForbiddenException('غير مصرح لك بالوصول إلى هذا المورد');
    }
    return store.id;
  }

  @Get()
  async thread(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    const storeId = await this.storeIdOf(slug, user);
    return this.customerChat.listMessages(storeId, user.id, Role.CUSTOMER);
  }

  @Get('unread-count')
  async unreadCount(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    const storeId = await this.storeIdOf(slug, user);
    const count = await this.customerChat.unreadCountForCustomer(storeId, user.id);
    return { count };
  }

  @Post()
  async send(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(sendCustomerMessageSchema)) dto: SendCustomerMessageDto,
  ) {
    const storeId = await this.storeIdOf(slug, user);
    return this.customerChat.sendMessage(storeId, user.id, user.id, Role.CUSTOMER, dto.body);
  }
}
