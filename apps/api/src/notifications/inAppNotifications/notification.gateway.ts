import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import passport = require('passport');

type Viewer = { userId: string; role: UserRole; clientCode: string | null };
type Session = { token: string; viewer: Viewer; pending?: Promise<Viewer> };
const HUMAN_ROLES = new Set([
  'CLIENT',
  'MICRO',
  'CHEMISTRY',
  'MC',
  'QA',
  'FRONTDESK',
  'ADMIN',
  'SYSTEMADMIN',
]);

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(NotificationGateway.name);
  private readonly sessions = new WeakMap<Socket, Session>();
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();
  private readonly recheckTimers = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  private readonly expiryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  afterInit(server: Server) {
    server.use((client, next) => {
      const token =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token.replace(/^Bearer\s+/i, '').trim()
          : '';
      if (!token || token.length > 16384) {
        next(this.authError());
        return;
      }
      void this.verifyToken(token)
        .then((viewer) => {
          this.sessions.set(client, { token, viewer });
          next();
        })
        .catch(() => next(this.authError()));
    });
  }

  private authError() {
    return Object.assign(new Error('Notification authentication required'), {
      data: { code: 'AUTH_REQUIRED' },
    });
  }

  private verifyToken(token: string): Promise<Viewer> {
    // Reuse the registered HTTP JwtStrategy: signature, expiry, active account,
    // passwordVersion and COMMON-account roles are checked by the same code.
    return new Promise((resolve, reject) => {
      const request = {
        headers: { authorization: `Bearer ${token}` },
      } as Request;
      passport.authenticate(
        'jwt',
        { session: false },
        (error: unknown, user: any) => {
          const id = user?.userId ?? user?.sub;
          if (
            error ||
            !user ||
            user.authMode === 'M2M' ||
            typeof id !== 'string' ||
            !id.trim() ||
            id.startsWith('m2m:') ||
            !HUMAN_ROLES.has(user.role)
          ) {
            reject(this.authError());
            return;
          }
          const code =
            typeof user.clientCode === 'string'
              ? user.clientCode.trim().toUpperCase()
              : null;
          if (user.role === 'CLIENT' && !code) {
            reject(this.authError());
            return;
          }
          resolve({
            userId: id,
            role: user.role,
            clientCode: user.role === 'CLIENT' ? code : null,
          });
        },
      )(request, {} as Response, () => reject(this.authError()));
    });
  }

  async handleConnection(client: Socket) {
    try {
      await this.refreshSession(client);
      if (!client.connected) return;
      // Revalidate account/password/role changes on idle connections as well.
      const timer = setInterval(() => {
        void this.refreshSession(client).catch(() =>
          this.rejectSession(client),
        );
      }, 30000);
      timer.unref?.();
      this.recheckTimers.set(client.id, timer);
      this.armExpiry(client);
    } catch {
      this.rejectSession(client);
    }
  }

  private refreshSession(client: Socket): Promise<Viewer> {
    const session = this.sessions.get(client);
    if (!session) return Promise.reject(this.authError());
    if (session.pending) return session.pending;
    session.pending = this.verifyToken(session.token)
      .then(async (viewer) => {
        if (!client.connected) throw this.authError();
        const nextRooms = new Set([
          `user:${viewer.userId}`,
          `role:${viewer.role}`,
        ]);
        if (viewer.clientCode) nextRooms.add(`clientCode:${viewer.clientCode}`);
        // Remove every obsolete authorization room, including a removed clientCode.
        for (const room of [...client.rooms]) {
          if (/^(user|role|clientCode):/.test(room) && !nextRooms.has(room))
            await client.leave(room);
        }
        for (const room of nextRooms) await client.join(room);
        if (!client.connected) throw this.authError();
        const previous = this.socketUsers.get(client.id);
        if (previous && previous !== viewer.userId)
          this.markSocketOffline(client.id);
        session.viewer = viewer;
        client.data.userId = viewer.userId;
        client.data.role = viewer.role;
        client.data.clientCode = viewer.clientCode;
        this.markUserOnline(viewer.userId, client.id);
        return viewer;
      })
      .finally(() => {
        session.pending = undefined;
      });
    return session.pending;
  }

  private armExpiry(client: Socket) {
    const token = this.sessions.get(client)?.token;
    if (!token) return;
    // This payload is decoded only AFTER Passport has verified the token.
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      );
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp))
        return;
      const remaining = payload.exp * 1000 - Date.now();
      if (remaining <= 0) {
        this.rejectSession(client);
        return;
      }
      const timer = setTimeout(
        () => {
          if (remaining > 2147483647) this.armExpiry(client);
          else this.rejectSession(client);
        },
        Math.min(remaining, 2147483647),
      );
      timer.unref?.();
      this.expiryTimers.set(client.id, timer);
    } catch {
      this.rejectSession(client);
    }
  }

  private rejectSession(client: Socket) {
    if (client.connected) {
      this.log.warn(`Notification session rejected: socket=${client.id}`);
      client.emit('notifications:auth-required', { reason: 'SESSION_INVALID' });
    }
    client.disconnect(true);
    this.handleDisconnect(client); // Also clears state if connection initialization failed.
  }

  // Backward compatible: an old browser may still send a body; it is ignored.
  @SubscribeMessage('notifications:join')
  async handleJoin(@ConnectedSocket() client: Socket) {
    try {
      const viewer = await this.refreshSession(client);
      return { ok: true, socketId: client.id, ...viewer };
    } catch {
      this.rejectSession(client);
      return { ok: false };
    }
  }

  @SubscribeMessage('presence:get')
  async handlePresenceGet(@ConnectedSocket() client: Socket) {
    try {
      const viewer = await this.refreshSession(client);
      if (viewer.role !== 'ADMIN' && viewer.role !== 'SYSTEMADMIN')
        return { onlineUserIds: [] };
      return { onlineUserIds: [...this.userSockets.keys()] };
    } catch {
      this.rejectSession(client);
      return { onlineUserIds: [] };
    }
  }

  emitToUser(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('notification:new', payload);
  }
  emitToRole(role: string, payload: any) {
    this.server.to(`role:${role}`).emit('notification:new', payload);
  }
  emitToClientCode(clientCode: string, payload: any) {
    const code = String(clientCode ?? '')
      .trim()
      .toUpperCase();
    if (code)
      this.server.to(`clientCode:${code}`).emit('notification:new', payload);
  }
  emitForceLogoutToUser(userId: string, reason = 'ADMIN_FORCE_SIGNOUT') {
    this.server.to(`user:${userId}`).emit('auth:force-logout', { reason });
  }
  emitForceLogoutToClientCode(
    clientCode: string,
    reason = 'CLIENT_DEACTIVATED',
  ) {
    const code = String(clientCode ?? '')
      .trim()
      .toUpperCase();
    if (code)
      this.server
        .to(`clientCode:${code}`)
        .emit('auth:force-logout', { reason, clientCode: code });
  }

  private emitPresenceChanged(userId: string, online: boolean) {
    this.server
      .to('role:ADMIN')
      .to('role:SYSTEMADMIN')
      .emit('presence:changed', { userId, online });
  }
  private markUserOnline(userId: string, socketId: string) {
    let sockets = this.userSockets.get(userId);
    const wasOffline = !sockets?.size;
    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    this.socketUsers.set(socketId, userId);
    if (wasOffline) this.emitPresenceChanged(userId, true);
  }
  private markSocketOffline(socketId: string) {
    const userId = this.socketUsers.get(socketId);
    if (!userId) return;
    this.socketUsers.delete(socketId);
    const sockets = this.userSockets.get(userId);
    sockets?.delete(socketId);
    if (!sockets?.size) {
      this.userSockets.delete(userId);
      this.emitPresenceChanged(userId, false);
    }
  }
  handleDisconnect(client: Socket) {
    const recheck = this.recheckTimers.get(client.id);
    if (recheck) clearInterval(recheck);
    this.recheckTimers.delete(client.id);
    const expiry = this.expiryTimers.get(client.id);
    if (expiry) clearTimeout(expiry);
    this.expiryTimers.delete(client.id);
    this.sessions.delete(client);
    this.markSocketOffline(client.id);
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
