import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma';
import { MessagingGateway } from './messaging.gateway';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MessagingGateway,
  ) {}

  private otherRole(viewerRole: Role): Role {
    return viewerRole === Role.SUPER_ADMIN ? Role.MERCHANT : Role.SUPER_ADMIN;
  }

  private async getOrCreateConversation(storeId: string) {
    const existing = await this.prisma.conversation.findUnique({
      where: { storeId },
    });
    if (existing) return existing;
    return this.prisma.conversation.create({ data: { storeId } });
  }

  /** Fetches the thread and marks the other side's messages as read. */
  async listMessages(storeId: string, viewerRole: Role) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { storeId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) return [];

    await this.prisma.message.updateMany({
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
    senderId: string,
    senderRole: Role,
    body: string,
  ) {
    const conversation = await this.getOrCreateConversation(storeId);
    const message = await this.prisma.message.create({
      data: { conversationId: conversation.id, senderId, senderRole, body },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt },
    });
    this.gateway.emitNewMessage(storeId, message);
    return message;
  }

  async unreadCountForMerchant(storeId: string): Promise<number> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { storeId },
    });
    if (!conversation) return 0;
    return this.prisma.message.count({
      where: {
        conversationId: conversation.id,
        senderRole: Role.SUPER_ADMIN,
        readAt: null,
      },
    });
  }

  /** storeId -> count of unread merchant replies, for the admin store list. */
  async unreadCountsForAdmin(): Promise<Record<string, number>> {
    const rows = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: { senderRole: Role.MERCHANT, readAt: null },
      _count: { _all: true },
    });
    if (rows.length === 0) return {};

    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: rows.map((r) => r.conversationId) } },
      select: { id: true, storeId: true },
    });
    const storeIdByConversation = new Map(
      conversations.map((c) => [c.id, c.storeId]),
    );

    const result: Record<string, number> = {};
    for (const row of rows) {
      const storeId = storeIdByConversation.get(row.conversationId);
      if (storeId) result[storeId] = row._count._all;
    }
    return result;
  }

  /** Last-message preview + unread count per store, for the admin inbox list. */
  async summaryForAdmin(): Promise<
    Array<{
      storeId: string;
      lastMessageBody: string;
      lastMessageSenderRole: Role;
      lastMessageAt: Date;
      unreadCount: number;
    }>
  > {
    const conversations = await this.prisma.conversation.findMany({
      where: { messages: { some: {} } },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        storeId: true,
        lastMessageAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, senderRole: true },
        },
      },
    });
    const unread = await this.unreadCountsForAdmin();

    return conversations
      .filter((c) => c.messages.length > 0 && c.lastMessageAt)
      .map((c) => ({
        storeId: c.storeId,
        lastMessageBody: c.messages[0].body,
        lastMessageSenderRole: c.messages[0].senderRole,
        lastMessageAt: c.lastMessageAt as Date,
        unreadCount: unread[c.storeId] ?? 0,
      }));
  }
}
