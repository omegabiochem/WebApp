import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import {
  Server,
  Socket,
} from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationGateway {
  @WebSocketServer()
  server!: Server;

  /*
   * userId -> all socket IDs currently connected
   *
   * This correctly handles:
   * - multiple tabs
   * - multiple browser windows
   * - multiple devices
   */
  private readonly userSockets =
    new Map<string, Set<string>>();

  /*
   * socketId -> userId
   *
   * Used when a socket disconnects.
   */
  private readonly socketUsers =
    new Map<string, string>();

  /* =========================================================
     NORMAL NOTIFICATIONS
  ========================================================= */

  emitToUser(
    userId: string,
    payload: any,
  ) {
    this.server
      .to(`user:${userId}`)
      .emit(
        'notification:new',
        payload,
      );
  }

  emitToRole(
    role: string,
    payload: any,
  ) {
    this.server
      .to(`role:${role}`)
      .emit(
        'notification:new',
        payload,
      );
  }

  emitToClientCode(
    clientCode: string,
    payload: any,
  ) {
    this.server
      .to(
        `clientCode:${clientCode}`,
      )
      .emit(
        'notification:new',
        payload,
      );
  }

  /* =========================================================
     FORCE LOGOUT
  ========================================================= */

  emitForceLogoutToUser(
    userId: string,
    reason = 'ADMIN_FORCE_SIGNOUT',
  ) {
    console.log(
      '🚪 Force logout user:',
      userId,
      reason,
    );

    this.server
      .to(`user:${userId}`)
      .emit(
        'auth:force-logout',
        {
          reason,
        },
      );
  }

  emitForceLogoutToClientCode(
    clientCode: string,
    reason = 'CLIENT_DEACTIVATED',
  ) {
    const normalized =
      clientCode
        .trim()
        .toUpperCase();

    this.server
      .to(
        `clientCode:${normalized}`,
      )
      .emit(
        'auth:force-logout',
        {
          reason,
          clientCode: normalized,
        },
      );
  }

  /* =========================================================
     PRESENCE
  ========================================================= */

  private emitPresenceChanged(
    userId: string,
    online: boolean,
  ) {
    const payload = {
      userId,
      online,
    };

    /*
     * Only Admin/SystemAdmin need presence information.
     */
    this.server
      .to('role:ADMIN')
      .emit(
        'presence:changed',
        payload,
      );

    this.server
      .to('role:SYSTEMADMIN')
      .emit(
        'presence:changed',
        payload,
      );

    console.log(
      online
        ? '🟢 User online:'
        : '⚪ User offline:',
      userId,
    );
  }

  private markUserOnline(
    userId: string,
    socketId: string,
  ) {
    let sockets =
      this.userSockets.get(
        userId,
      );

    const wasOffline =
      !sockets ||
      sockets.size === 0;

    if (!sockets) {
      sockets =
        new Set<string>();

      this.userSockets.set(
        userId,
        sockets,
      );
    }

    sockets.add(
      socketId,
    );

    this.socketUsers.set(
      socketId,
      userId,
    );

    /*
     * Only broadcast when the user
     * transitions OFFLINE -> ONLINE.
     */
    if (wasOffline) {
      this.emitPresenceChanged(
        userId,
        true,
      );
    }
  }

  private markSocketOffline(
    socketId: string,
  ) {
    const userId =
      this.socketUsers.get(
        socketId,
      );

    if (!userId) {
      return;
    }

    this.socketUsers.delete(
      socketId,
    );

    const sockets =
      this.userSockets.get(
        userId,
      );

    if (!sockets) {
      return;
    }

    sockets.delete(
      socketId,
    );

    /*
     * User may still have another
     * tab/device connected.
     */
    if (sockets.size > 0) {
      return;
    }

    this.userSockets.delete(
      userId,
    );

    this.emitPresenceChanged(
      userId,
      false,
    );
  }

  /* =========================================================
     JOIN
  ========================================================= */

  @SubscribeMessage(
    'notifications:join',
  )
  handleJoin(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    body: {
      userId?: string;
      role?: string;
      clientCode?: string;
    },
  ) {
    if (body.userId) {
      /*
       * If this socket was previously associated
       * with another user, clean it first.
       */
      const previousUser =
        this.socketUsers.get(
          client.id,
        );

      if (
        previousUser &&
        previousUser !==
          body.userId
      ) {
        this.markSocketOffline(
          client.id,
        );
      }

      client.join(
        `user:${body.userId}`,
      );

      this.markUserOnline(
        body.userId,
        client.id,
      );

      client.data.userId =
        body.userId;
    }

    if (body.role) {
      client.join(
        `role:${body.role}`,
      );

      client.data.role =
        body.role;
    }

    if (body.clientCode) {
      const clientCode =
        body.clientCode
          .trim()
          .toUpperCase();

      client.join(
        `clientCode:${clientCode}`,
      );

      client.data.clientCode =
        clientCode;
    }

    /*
     * Cleanup when this browser/tab disconnects.
     */
    client.once(
      'disconnect',
      () => {
        this.markSocketOffline(
          client.id,
        );
      },
    );

    return {
      ok: true,
    };
  }

  /* =========================================================
     GET ONLINE USERS
  ========================================================= */

  @SubscribeMessage(
    'presence:get',
  )
  handlePresenceGet(
    @ConnectedSocket()
    client: Socket,
  ) {
    /*
     * Presence information should only
     * be exposed to Admin/SystemAdmin.
     */
    if (
      client.data.role !==
        'ADMIN' &&
      client.data.role !==
        'SYSTEMADMIN'
    ) {
      return {
        onlineUserIds: [],
      };
    }

    return {
      onlineUserIds:
        Array.from(
          this.userSockets.keys(),
        ),
    };
  }
}