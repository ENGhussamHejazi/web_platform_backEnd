import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import type { CustomerMessage, Message } from '../../generated/prisma';

interface SocketUser {
  id: string;
  role: Role;
  storeId: string | null;
}

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: 'messaging',
  cors: { origin: corsOrigins, credentials: true },
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('no token');

      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { store: { select: { id: true } } },
      });
      if (!user) throw new Error('user not found');

      const socketUser: SocketUser = {
        id: user.id,
        role: user.role,
        storeId: user.store?.id ?? null,
      };
      client.data.user = socketUser;

      if (socketUser.role === Role.MERCHANT && socketUser.storeId) {
        await client.join(`store:${socketUser.storeId}`);
      } else if (socketUser.role === Role.SUPER_ADMIN) {
        await client.join('admin');
      } else if (socketUser.role === Role.CUSTOMER && user.storeId) {
        // Customer's own thread with the store, distinct from the
        // merchant<->admin `store:${storeId}` room above.
        await client.join(`store:${user.storeId}:customer:${user.id}`);
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // socket.io leaves all rooms automatically on disconnect
  }

  /** Notifies the merchant's room and the admin room a new message landed. */
  emitNewMessage(storeId: string, message: Message) {
    this.server.to(`store:${storeId}`).to('admin').emit('message:new', {
      storeId,
      message,
    });
  }

  /**
   * Notifies the store owner's inbox (`store:${storeId}`, already joined by
   * merchants above) and that specific customer's own thread room.
   */
  emitNewCustomerMessage(
    storeId: string,
    customerId: string,
    message: CustomerMessage,
  ) {
    this.server
      .to(`store:${storeId}`)
      .to(`store:${storeId}:customer:${customerId}`)
      .emit('customerChat:new', { storeId, customerId, message });
  }

  /**
   * Notifies the merchant's dashboard the instant a customer places an
   * order — drives the "new order" sound alert even while the merchant has
   * the tab backgrounded (unlike the polling fallback, which browsers throttle
   * or pause for background tabs).
   */
  emitNewOrder(storeId: string, orderId: string) {
    this.server.to(`store:${storeId}`).emit('order:new', { storeId, orderId });
  }
}
