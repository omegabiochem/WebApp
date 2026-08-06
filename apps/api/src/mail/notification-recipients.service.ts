// apps/api/src/mail/notification-recipients.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ClientNotifyMode, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class NotificationRecipientsService {
  private readonly log = new Logger(NotificationRecipientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalize(list: string[]) {
    const emails = list
      .map((email) => String(email ?? '').trim().toLowerCase())
      .filter((email) => email.length > 0 && email.includes('@'));

    return [...new Set(emails)];
  }

  private normalizeClientCode(clientCode: string) {
    return String(clientCode ?? '').trim();
  }

  /**
   * Find active CLIENT users using case-insensitive client-code matching.
   */
  private async getUserEmails(clientCode: string) {
    const code = this.normalizeClientCode(clientCode);
    if (!code) return [];

    const rows = await this.prisma.user.findMany({
      where: {
        clientCode: {
          equals: code,
          mode: 'insensitive',
        },
        role: UserRole.CLIENT,
        active: true,
        email: {
          not: '',
        },
      },
      select: {
        email: true,
        clientCode: true,
      },
    });

    const emails = this.normalize(rows.map((row) => row.email ?? ''));

    this.log.log(
      `[CLIENT RECIPIENTS] source=users clientCode=${code} ` +
        `rows=${rows.length} emails=${emails.length}`,
    );

    return emails;
  }

  /**
   * Find active custom notification emails using case-insensitive
   * client-code matching.
   */
  private async getCustomEmails(clientCode: string) {
    const code = this.normalizeClientCode(clientCode);
    if (!code) return [];

    const rows = await this.prisma.clientNotificationEmail.findMany({
      where: {
        clientCode: {
          equals: code,
          mode: 'insensitive',
        },
        active: true,
      },
      select: {
        email: true,
        clientCode: true,
      },
    });

    const emails = this.normalize(rows.map((row) => row.email ?? ''));

    this.log.log(
      `[CLIENT RECIPIENTS] source=custom clientCode=${code} ` +
        `rows=${rows.length} emails=${emails.length}`,
    );

    return emails;
  }

  /**
   * Resolve the notification mode using case-insensitive client-code matching.
   */
  private async getClientMode(
    clientCode: string,
  ): Promise<ClientNotifyMode> {
    const code = this.normalizeClientCode(clientCode);

    const config = await this.prisma.clientNotificationConfig.findFirst({
      where: {
        clientCode: {
          equals: code,
          mode: 'insensitive',
        },
      },
      select: {
        clientCode: true,
        mode: true,
      },
    });

    if (!config) {
      this.log.warn(
        `[CLIENT RECIPIENTS] No notification config for clientCode=${code}; ` +
          `using USERS_PLUS_CUSTOM`,
      );
    }

    return config?.mode ?? ClientNotifyMode.USERS_PLUS_CUSTOM;
  }

  async getClientNotificationEmails(
    clientCode: string,
  ): Promise<string[]> {
    const code = this.normalizeClientCode(clientCode);

    if (!code) {
      this.log.warn(
        '[CLIENT RECIPIENTS] Empty clientCode supplied',
      );
      return [];
    }

    const mode = await this.getClientMode(code);

    const shouldLoadUsers = mode !== ClientNotifyMode.CUSTOM_ONLY;
    const shouldLoadCustom = mode !== ClientNotifyMode.USERS_ONLY;

    const [users, custom] = await Promise.all([
      shouldLoadUsers ? this.getUserEmails(code) : Promise.resolve([]),
      shouldLoadCustom ? this.getCustomEmails(code) : Promise.resolve([]),
    ]);

    let merged: string[];

    switch (mode) {
      case ClientNotifyMode.CUSTOM_ONLY:
        merged = custom;
        break;

      case ClientNotifyMode.USERS_ONLY:
        merged = users;
        break;

      case ClientNotifyMode.USERS_PLUS_CUSTOM:
      default:
        merged = [...users, ...custom];
        break;
    }

    const finalList = this.normalize(merged);

    this.log.log(
      `[CLIENT RECIPIENTS] clientCode=${code} mode=${mode} ` +
        `userEmails=${users.length} customEmails=${custom.length} ` +
        `finalEmails=${finalList.length}`,
    );

    if (finalList.length === 0) {
      this.log.warn(
        `[CLIENT RECIPIENTS] No notification recipients found for ` +
          `clientCode=${code} mode=${mode}`,
      );
    }

    return finalList;
  }

  /**
   * Return active user email addresses for one or more internal roles.
   */
  async getRoleNotificationEmails(
    roles: UserRole[],
  ): Promise<string[]> {
    const uniqueRoles = [...new Set(roles)].filter(
      (role): role is UserRole => Boolean(role),
    );

    if (uniqueRoles.length === 0) return [];

    const rows = await this.prisma.user.findMany({
      where: {
        active: true,
        role: {
          in: uniqueRoles,
        },
        email: {
          not: '',
        },
      },
      select: {
        email: true,
        role: true,
      },
    });

    const finalList = this.normalize(
      rows.map((row) => row.email ?? ''),
    );

    if (finalList.length === 0) {
      this.log.warn(
        `No active notification recipients for roles=${uniqueRoles.join(',')}`,
      );
    }

    return finalList;
  }
}