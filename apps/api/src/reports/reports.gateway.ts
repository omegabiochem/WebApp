import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import {
  Server,
  Socket,
} from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ReportsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  handleConnection(
    client: Socket,
  ) {
    const ua =
      client.handshake?.headers?.[
        'user-agent'
      ];

    const origin =
      client.handshake?.headers
        ?.origin;

    const referer =
      client.handshake?.headers
        ?.referer;

    const authToken =
      client.handshake?.auth?.token
        ? 'yes'
        : 'no';

    console.log(
      '✅ WS connected:',
      client.id,
      'count=',
      this.server.engine
        .clientsCount,
      'token=',
      authToken,
      'origin=',
      origin,
      'referer=',
      referer,
      'ua=',
      ua?.slice(0, 60),
    );
  }

  handleDisconnect(
    client: Socket,
  ) {
    console.log(
      '❌ WS disconnected:',
      client.id,
      'count=',
      this.server.engine
        .clientsCount,
    );
  }

  notifyReportCreated(
    payload: any,
  ) {
    console.log(
      '📣 emit report.created',
    );

    this.server.emit(
      'report.created',
      payload,
    );
  }

  notifyReportUpdate(
    payload: any,
  ) {
    console.log(
      '📣 emit report.updated',
    );

    this.server.emit(
      'report.updated',
      payload,
    );
  }

  notifyStatusChange(
    reportId: string,
    status: string,
  ) {
    console.log(
      '📣 emit report.statusChanged',
      reportId,
      status,
    );

    this.server.emit(
      'report.statusChanged',
      {
        reportId,
        status,
      },
    );
  }
}