import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma';
import { MessagingGateway } from '../messaging/messaging.gateway';
import { EntitlementsService } from '../entitlements/entitlements.service';

@Injectable()
export class CustomerChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MessagingGateway,
    private readonly entitlements: EntitlementsService,
  ) {}

  private otherRole(viewerRole: Role): Role {
    return viewerRole === Role.CUSTOMER ? Role.MERCHANT : Role.CUSTOMER;
  }

  private async assertEnabled(storeId: string) {
    const enabled = await this.entitlements.hasFeature(storeId, 'CUSTOMER_CHAT');
    if (!enabled) {
      throw new ForbiddenException(
        'محادثة العملاء غير متاحة في باقة اشتراك متجرك الحالية',
      );
    }
  }

  private async getOrCreateConversation(storeId: string, customerId: string) {
    const existing = await this.prisma.customerConversation.findUnique({
      where: { storeId_customerId: { storeId, customerId } },
    });
    if (existing) return existing;
    return this.prisma.customerConversation.create({
      data: { storeId, customerId },
    });
  }

  /** Fetches the thread and marks the other side's messages as read. */
  async listMessages(storeId: string, customerId: string, viewerRole: Role) {
    await this.assertEnabled(storeId);

    const conversation = await this.prisma.customerConversation.findUnique({
      where: { storeId_customerId: { storeId, customerId } },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) return [];

    await this.prisma.customerMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderRole: this.otherRole(viewerRole),
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return conversation.messages;
  }

  async sendMessage(
    storeId: string,
    customerId: string,
    senderId: string,
    senderRole: Role,
    body: string,
  ) {
    await this.assertEnabled(storeId);

    if (senderRole === Role.CUSTOMER) {
      const customer = await this.prisma.user.findFirst({
        where: { id: customerId, storeId, role: Role.CUSTOMER },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('العميل غير موجود');
    }

    const conversation = await this.getOrCreateConversation(storeId, customerId);
    const message = await this.prisma.customerMessage.create({
      data: { conversationId: conversation.id, senderId, senderRole, body },
    });
    await this.prisma.customerConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt },
    });
    this.gateway.emitNewCustomerMessage(storeId, customerId, message);
    return message;
  }

  async unreadCountForMerchant(storeId: string): Promise<number> {
    return this.prisma.customerMessage.count({
      where: {
        conversation: { storeId },
        senderRole: Role.CUSTOMER,
        readAt: null,
      },
    });
  }

  async unreadCountForCustomer(storeId: string, customerId: string): Promise<number> {
    const conversation = await this.prisma.customerConversation.findUnique({
      where: { storeId_customerId: { storeId, customerId } },
    });
    if (!conversation) return 0;
    return this.prisma.customerMessage.count({
      where: {
        conversationId: conversation.id,
        senderRole: Role.MERCHANT,
        readAt: null,
      },
    });
  }

  /** Customer list + last-message preview + unread count, for the merchant inbox. */
  async listConversationsForMerchant(storeId: string): Promise<
    Array<{
      customerId: string;
      customerName: string;
      customerEmail: string;
      lastMessageBody: string | null;
      lastMessageSenderRole: Role | null;
      lastMessageAt: Date | null;
      unreadCount: number;
    }>
  > {
    await this.assertEnabled(storeId);

    const conversations = await this.prisma.customerConversation.findMany({
      where: { storeId, messages: { some: {} } },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        customerId: true,
        lastMessageAt: true,
        customer: { select: { name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, senderRole: true },
        },
        _count: {
          select: {
            messages: { where: { senderRole: Role.CUSTOMER, readAt: null } },
          },
        },
      },
    });

    return conversations
      .filter((c) => c.messages.length > 0)
      .map((c) => ({
        customerId: c.customerId,
        customerName: c.customer.name,
        customerEmail: c.customer.email,
        lastMessageBody: c.messages[0].body,
        lastMessageSenderRole: c.messages[0].senderRole,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c._count.messages,
      }));
  }
}
