import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
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
export class NotificationGateway
  implements OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  /*
   * userId -> all socket IDs currently connected
   *
   * Supports:
   * - multiple tabs
   * - multiple browser windows
   * - multiple devices
   */
  private readonly userSockets =
    new Map<string, Set<string>>();

  /*
   * socketId -> userId
   *
   * Used during disconnect cleanup.
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
    const normalized =
      String(clientCode ?? '')
        .trim()
        .toUpperCase();

    if (!normalized) {
      return;
    }

    this.server
      .to(
        `clientCode:${normalized}`,
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
      String(clientCode ?? '')
        .trim()
        .toUpperCase();

    if (!normalized) {
      return;
    }

    console.log(
      '🚪 Force logout client:',
      normalized,
      reason,
    );

    this.server
      .to(
        `clientCode:${normalized}`,
      )
      .emit(
        'auth:force-logout',
        {
          reason,
          clientCode:
            normalized,
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
     * Only ADMIN and SYSTEMADMIN
     * need online presence updates.
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
    const normalizedUserId =
      String(userId ?? '')
        .trim();

    if (!normalizedUserId) {
      return;
    }

    let sockets =
      this.userSockets.get(
        normalizedUserId,
      );

    const wasOffline =
      !sockets ||
      sockets.size === 0;

    if (!sockets) {
      sockets =
        new Set<string>();

      this.userSockets.set(
        normalizedUserId,
        sockets,
      );
    }

    /*
     * Set automatically avoids duplicate
     * socket IDs if notifications:join
     * is emitted multiple times.
     */
    sockets.add(
      socketId,
    );

    this.socketUsers.set(
      socketId,
      normalizedUserId,
    );

    /*
     * Broadcast only when the user's
     * first socket comes online.
     */
    if (wasOffline) {
      this.emitPresenceChanged(
        normalizedUserId,
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
     * User is still online if another
     * tab/window/device is connected.
     */
    if (sockets.size > 0) {
      return;
    }

    /*
     * No remaining sockets.
     */
    this.userSockets.delete(
      userId,
    );

    this.emitPresenceChanged(
      userId,
      false,
    );
  }

  /* =========================================================
     JOIN NOTIFICATION / PRESENCE ROOMS
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
    /* =======================================================
       USER ROOM
    ======================================================= */

    const userId =
      String(body?.userId ?? '')
        .trim();

    if (userId) {
      const previousUser =
        this.socketUsers.get(
          client.id,
        );

      /*
       * If the same socket was previously
       * associated with another user,
       * clean up that old presence entry.
       */
      if (
        previousUser &&
        previousUser !==
          userId
      ) {
        /*
         * Leave previous user room.
         */
        client.leave(
          `user:${previousUser}`,
        );

        /*
         * Remove previous presence mapping.
         */
        this.markSocketOffline(
          client.id,
        );
      }

      client.join(
        `user:${userId}`,
      );

      this.markUserOnline(
        userId,
        client.id,
      );

      client.data.userId =
        userId;
    }

    /* =======================================================
       ROLE ROOM
    ======================================================= */

    const role =
      String(body?.role ?? '')
        .trim()
        .toUpperCase();

    if (role) {
      const previousRole =
        String(
          client.data.role ?? '',
        )
          .trim()
          .toUpperCase();

      /*
       * If role changed on this socket,
       * leave the old role room first.
       */
      if (
        previousRole &&
        previousRole !==
          role
      ) {
        client.leave(
          `role:${previousRole}`,
        );
      }

      client.join(
        `role:${role}`,
      );

      client.data.role =
        role;
    }

    /* =======================================================
       CLIENT CODE ROOM
    ======================================================= */

    const clientCode =
      String(
        body?.clientCode ?? '',
      )
        .trim()
        .toUpperCase();

    if (clientCode) {
      const previousClientCode =
        String(
          client.data.clientCode ??
            '',
        )
          .trim()
          .toUpperCase();

      /*
       * If the socket changed client,
       * leave its previous client room.
       */
      if (
        previousClientCode &&
        previousClientCode !==
          clientCode
      ) {
        client.leave(
          `clientCode:${previousClientCode}`,
        );
      }

      client.join(
        `clientCode:${clientCode}`,
      );

      client.data.clientCode =
        clientCode;
    }

    /*
     * IMPORTANT:
     *
     * DO NOT add:
     *
     * client.once('disconnect', ...)
     *
     * here.
     *
     * notifications:join can be emitted more
     * than once while the same socket remains
     * connected.
     *
     * Adding disconnect listeners here caused:
     *
     * MaxListenersExceededWarning:
     * 11 disconnect listeners added to [Socket]
     *
     * Disconnect cleanup is handled once by
     * handleDisconnect() below.
     */

    console.log(
      '🔔 Notification rooms joined:',
      {
        socketId:
          client.id,

        userId:
          client.data.userId ??
          null,

        role:
          client.data.role ??
          null,

        clientCode:
          client.data.clientCode ??
          null,
      },
    );

    return {
      ok: true,

      socketId:
        client.id,

      userId:
        client.data.userId ??
        null,

      role:
        client.data.role ??
        null,

      clientCode:
        client.data.clientCode ??
        null,
    };
  }

  /* =========================================================
     SOCKET DISCONNECT
  ========================================================= */

  handleDisconnect(
    client: Socket,
  ) {
    /*
     * Nest calls this once when the socket
     * actually disconnects.
     *
     * This replaces the old:
     *
     * client.once('disconnect', ...)
     *
     * inside notifications:join.
     */
    this.markSocketOffline(
      client.id,
    );

    console.log(
      '🔌 Notification socket disconnected:',
      client.id,
    );
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
    const role =
      String(
        client.data.role ?? '',
      )
        .trim()
        .toUpperCase();

    /*
     * Presence information should
     * only be exposed to ADMIN
     * and SYSTEMADMIN.
     */
    if (
      role !==
        'ADMIN' &&
      role !==
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




// import {
//   ConnectedSocket,
//   MessageBody,
//   SubscribeMessage,
//   WebSocketGateway,
//   WebSocketServer,
// } from '@nestjs/websockets';

// import {
//   Server,
//   Socket,
// } from 'socket.io';

// @WebSocketGateway({
//   cors: {
//     origin: true,
//     credentials: true,
//   },
// })
// export class NotificationGateway {
//   @WebSocketServer()
//   server!: Server;

//   /*
//    * userId -> all socket IDs currently connected
//    *
//    * This correctly handles:
//    * - multiple tabs
//    * - multiple browser windows
//    * - multiple devices
//    */
//   private readonly userSockets =
//     new Map<string, Set<string>>();

//   /*
//    * socketId -> userId
//    *
//    * Used when a socket disconnects.
//    */
//   private readonly socketUsers =
//     new Map<string, string>();

//   /* =========================================================
//      NORMAL NOTIFICATIONS
//   ========================================================= */

//   emitToUser(
//     userId: string,
//     payload: any,
//   ) {
//     this.server
//       .to(`user:${userId}`)
//       .emit(
//         'notification:new',
//         payload,
//       );
//   }

//   emitToRole(
//     role: string,
//     payload: any,
//   ) {
//     this.server
//       .to(`role:${role}`)
//       .emit(
//         'notification:new',
//         payload,
//       );
//   }

//   emitToClientCode(
//     clientCode: string,
//     payload: any,
//   ) {
//     this.server
//       .to(
//         `clientCode:${clientCode}`,
//       )
//       .emit(
//         'notification:new',
//         payload,
//       );
//   }

//   /* =========================================================
//      FORCE LOGOUT
//   ========================================================= */

//   emitForceLogoutToUser(
//     userId: string,
//     reason = 'ADMIN_FORCE_SIGNOUT',
//   ) {
//     console.log(
//       '🚪 Force logout user:',
//       userId,
//       reason,
//     );

//     this.server
//       .to(`user:${userId}`)
//       .emit(
//         'auth:force-logout',
//         {
//           reason,
//         },
//       );
//   }

//   emitForceLogoutToClientCode(
//     clientCode: string,
//     reason = 'CLIENT_DEACTIVATED',
//   ) {
//     const normalized =
//       clientCode
//         .trim()
//         .toUpperCase();

//     this.server
//       .to(
//         `clientCode:${normalized}`,
//       )
//       .emit(
//         'auth:force-logout',
//         {
//           reason,
//           clientCode: normalized,
//         },
//       );
//   }

//   /* =========================================================
//      PRESENCE
//   ========================================================= */

//   private emitPresenceChanged(
//     userId: string,
//     online: boolean,
//   ) {
//     const payload = {
//       userId,
//       online,
//     };

//     /*
//      * Only Admin/SystemAdmin need presence information.
//      */
//     this.server
//       .to('role:ADMIN')
//       .emit(
//         'presence:changed',
//         payload,
//       );

//     this.server
//       .to('role:SYSTEMADMIN')
//       .emit(
//         'presence:changed',
//         payload,
//       );

//     console.log(
//       online
//         ? '🟢 User online:'
//         : '⚪ User offline:',
//       userId,
//     );
//   }

//   private markUserOnline(
//     userId: string,
//     socketId: string,
//   ) {
//     let sockets =
//       this.userSockets.get(
//         userId,
//       );

//     const wasOffline =
//       !sockets ||
//       sockets.size === 0;

//     if (!sockets) {
//       sockets =
//         new Set<string>();

//       this.userSockets.set(
//         userId,
//         sockets,
//       );
//     }

//     sockets.add(
//       socketId,
//     );

//     this.socketUsers.set(
//       socketId,
//       userId,
//     );

//     /*
//      * Only broadcast when the user
//      * transitions OFFLINE -> ONLINE.
//      */
//     if (wasOffline) {
//       this.emitPresenceChanged(
//         userId,
//         true,
//       );
//     }
//   }

//   private markSocketOffline(
//     socketId: string,
//   ) {
//     const userId =
//       this.socketUsers.get(
//         socketId,
//       );

//     if (!userId) {
//       return;
//     }

//     this.socketUsers.delete(
//       socketId,
//     );

//     const sockets =
//       this.userSockets.get(
//         userId,
//       );

//     if (!sockets) {
//       return;
//     }

//     sockets.delete(
//       socketId,
//     );

//     /*
//      * User may still have another
//      * tab/device connected.
//      */
//     if (sockets.size > 0) {
//       return;
//     }

//     this.userSockets.delete(
//       userId,
//     );

//     this.emitPresenceChanged(
//       userId,
//       false,
//     );
//   }

//   /* =========================================================
//      JOIN
//   ========================================================= */

//   @SubscribeMessage(
//     'notifications:join',
//   )
//   handleJoin(
//     @ConnectedSocket()
//     client: Socket,

//     @MessageBody()
//     body: {
//       userId?: string;
//       role?: string;
//       clientCode?: string;
//     },
//   ) {
//     if (body.userId) {
//       /*
//        * If this socket was previously associated
//        * with another user, clean it first.
//        */
//       const previousUser =
//         this.socketUsers.get(
//           client.id,
//         );

//       if (
//         previousUser &&
//         previousUser !==
//           body.userId
//       ) {
//         this.markSocketOffline(
//           client.id,
//         );
//       }

//       client.join(
//         `user:${body.userId}`,
//       );

//       this.markUserOnline(
//         body.userId,
//         client.id,
//       );

//       client.data.userId =
//         body.userId;
//     }

//     if (body.role) {
//       client.join(
//         `role:${body.role}`,
//       );

//       client.data.role =
//         body.role;
//     }

//     if (body.clientCode) {
//       const clientCode =
//         body.clientCode
//           .trim()
//           .toUpperCase();

//       client.join(
//         `clientCode:${clientCode}`,
//       );

//       client.data.clientCode =
//         clientCode;
//     }

//     /*
//      * Cleanup when this browser/tab disconnects.
//      */
//     client.once(
//       'disconnect',
//       () => {
//         this.markSocketOffline(
//           client.id,
//         );
//       },
//     );

//     return {
//       ok: true,
//     };
//   }

//   /* =========================================================
//      GET ONLINE USERS
//   ========================================================= */

//   @SubscribeMessage(
//     'presence:get',
//   )
//   handlePresenceGet(
//     @ConnectedSocket()
//     client: Socket,
//   ) {
//     /*
//      * Presence information should only
//      * be exposed to Admin/SystemAdmin.
//      */
//     if (
//       client.data.role !==
//         'ADMIN' &&
//       client.data.role !==
//         'SYSTEMADMIN'
//     ) {
//       return {
//         onlineUserIds: [],
//       };
//     }

//     return {
//       onlineUserIds:
//         Array.from(
//           this.userSockets.keys(),
//         ),
//     };
//   }
// }