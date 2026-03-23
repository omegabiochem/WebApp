import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationGateway {
  @WebSocketServer()
  server: Server;

  emitToUser(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('notification:new', payload);
  }

  emitToRole(role: string, payload: any) {
    this.server.to(`role:${role}`).emit('notification:new', payload);
  }

  emitToClientCode(clientCode: string, payload: any) {
    this.server.to(`clientCode:${clientCode}`).emit('notification:new', payload);
  }

  @SubscribeMessage('notifications:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      userId?: string;
      role?: string;
      clientCode?: string;
    },
  ) {
    if (body.userId) client.join(`user:${body.userId}`);
    if (body.role) client.join(`role:${body.role}`);
    if (body.clientCode) client.join(`clientCode:${body.clientCode}`);

    return { ok: true };
  }
}