import { Injectable, Logger } from '@nestjs/common';
import { ServerClient } from 'postmark';

function escapeHtml(input: string) {
  return (input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly client: ServerClient;

  constructor() {
    if (!process.env.POSTMARK_SERVER_TOKEN) {
      throw new Error('POSTMARK_SERVER_TOKEN is not set');
    }
    this.client = new ServerClient(process.env.POSTMARK_SERVER_TOKEN);
  }

  async sendCredentialsEmail(args: {
    to: string;
    name?: string | null;
    userId: string;
    tempPassword: string;
    expiresAt: Date;
  }) {
    const { to, name, userId, tempPassword, expiresAt } = args;

    // Visible sender (what recipients see)
    const from =
      process.env.MAIL_FROM || 'Omega LIMS <no-reply@omegabiochemlab.com>';

    // Optional reply-to (where replies go if someone replies)
    // If you truly want no replies, set MAIL_REPLY_TO=no-reply@... (or omit it).
    const replyTo = process.env.MAIL_REPLY_TO || undefined;

    // Branding / support line
    const brandName = process.env.MAIL_BRAND_NAME || 'Omega Biochem';
    const brandSubtitle =
      process.env.MAIL_BRAND_SUBTITLE || 'Account credentials';
    const supportEmail =
      process.env.MAIL_SUPPORT_EMAIL || 'tech@omegabiochemlab.com';

    // Avoid sending localhost links in real emails
    const loginUrl =
      process.env.APP_URL && !process.env.APP_URL.includes('localhost')
        ? process.env.APP_URL
        : 'https://www.omegabiochemlab.com';

    const exp = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(expiresAt);

    const displayName = name?.trim() ? name.trim() : 'there';

    const subject = 'Omega LIMS — Your Account Login Credentials';

    const htmlBody = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#f3f6fb;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f6fb; padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px; max-width:640px; background:#ffffff; border:1px solid #e6eaf2; border-radius:14px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0b3a83; padding:18px 22px;">
              <div style="font-family: Arial, Helvetica, sans-serif; color:#ffffff; font-size:18px; font-weight:700; line-height:1.2;">
                ${escapeHtml(brandName)}
              </div>
              <div style="font-family: Arial, Helvetica, sans-serif; color:#dbe8ff; font-size:13px; font-weight:600; margin-top:4px;">
                ${escapeHtml(brandSubtitle)}
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:22px;">
              <div style="font-family: Arial, Helvetica, sans-serif; color:#111827; font-size:14px; line-height:1.6;">

                <p style="margin:0 0 12px 0;">
                  Hello <strong>${escapeHtml(displayName)}</strong>,
                </p>

                <p style="margin:0 0 16px 0;">
                  An account has been created for you. Use the credentials below to sign in.
                </p>

                <!-- Credential box -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                  style="background:#f6f8fc; border:1px solid #e6eaf2; border-radius:12px; padding:14px;">
                  <tr>
                    <td style="font-family: Arial, Helvetica, sans-serif; font-size:14px; color:#111827; line-height:1.7;">

                      <div style="margin:0 0 8px 0;">
                        <span style="color:#374151;">Login URL:</span>
                        <a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener noreferrer"
                          style="color:#0b3a83; font-weight:700; text-decoration:none;">
                          ${escapeHtml(loginUrl)}
                        </a>
                      </div>

                      <div style="margin:0 0 8px 0;">
                        <span style="color:#374151;">User ID:</span>
                        <span style="font-weight:700;">${escapeHtml(userId)}</span>
                      </div>

                      <div style="margin:0 0 8px 0;">
                        <span style="color:#374151;">Temporary password:</span>
                        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:700;">
                          ${escapeHtml(tempPassword)}
                        </span>
                      </div>

                      <div style="margin:0;">
                        <span style="color:#374151;">Expires:</span>
                        <span style="font-weight:700;">${escapeHtml(exp)}</span>
                      </div>

                    </td>
                  </tr>
                </table>

                <p style="margin:16px 0 0 0;">
                  For security, you will be required to change your password after signing in.
                </p>

                <p style="margin:14px 0 0 0; color:#374151;">
                  If you did not expect this email, please contact support at
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#0b3a83; font-weight:700; text-decoration:none;">
                    ${escapeHtml(supportEmail)}
                  </a>.
                </p>

              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #eef2f7; padding:14px 22px;">
              <div style="font-family: Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px; line-height:1.4;">
                © ${new Date().getFullYear()} <strong style="color:#111827;">${escapeHtml(brandName)}</strong>. This message was sent automatically.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const textBody = `Hello ${displayName},

An account has been created for you. Use the credentials below to sign in.

Login URL: ${loginUrl}
User ID: ${userId}
Temporary password: ${tempPassword}
Expires: ${exp}

For security, you will be required to change your password after signing in.

If you did not expect this email, contact support at ${supportEmail}.

— ${brandName}
`;

    await this.client.sendEmail({
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      Headers: [{ Name: 'X-PM-Sender', Value: 'tech@omegabiochemlab.com' }],
      MessageStream: 'outbound',
      ReplyTo: 'no-reply@omegabiochemlab.com',
      Tag: 'credentials',
      TrackOpens: true,
      TrackLinks: 'HtmlAndText' as any,
      Metadata: {
        userId: String(userId),
        emailType: 'credentials',
        app: 'omega-lims',
      },
    });

    this.log.log(`Credentials email sent via Postmark to ${to}`);
    this.log.log(
      `Credentials email accepted by Postmark (${process.env.POSTMARK_SERVER_NAME ?? 'unknown server'}) for ${to}`,
    );
  }

  async sendStatusNotificationEmail(args: {
    to: string;
    subject: string;
    title: string;
    lines: string[];
    actionUrl?: string;
    actionLabel?: string;
    tag: string;
    metadata: Record<string, any>;
  }) {
    const from =
      process.env.MAIL_FROM || 'Omega LIMS <no-reply@omegabiochemlab.com>';
    const replyTo = process.env.MAIL_REPLY_TO || 'no-reply@omegabiochemlab.com';
    const techSender =
      process.env.MAIL_TECH_SENDER || 'tech@omegabiochemlab.com';

    const brandName = process.env.MAIL_BRAND_NAME || 'Omega BioChem Lab';
    const brandSubtitle =
      process.env.MAIL_BRAND_SUBTITLE || 'Omega LIMS Notifications';

    const listHtml = args.lines
      .filter(Boolean)
      .map((l) => `<li style="margin:6px 0;">${escapeHtml(String(l))}</li>`)
      .join('');

    const actionHtml = args.actionUrl
      ? `
      <div style="margin-top:16px;">
        <a href="${escapeHtml(args.actionUrl)}"
           style="display:inline-block; background:#0b3a83; color:#fff; text-decoration:none; font-weight:700;
                  padding:10px 14px; border-radius:10px;">
          ${escapeHtml(args.actionLabel || 'Open')}
        </a>
      </div>
    `
      : '';

    const htmlBody = `
<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0; padding:0; background:#f3f6fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb; padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0"
               style="width:640px; max-width:640px; background:#fff; border:1px solid #e6eaf2;
                      border-radius:14px; overflow:hidden;">
          <tr>
            <td style="background:#0b3a83; padding:18px 22px;">
              <div style="font-family:Arial; color:#fff; font-size:18px; font-weight:800;">${escapeHtml(brandName)}</div>
              <div style="font-family:Arial; color:#dbe8ff; font-size:13px; font-weight:600; margin-top:4px;">${escapeHtml(brandSubtitle)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px; font-family:Arial; color:#111827; font-size:14px; line-height:1.6;">
              <h2 style="margin:0 0 12px 0; font-size:16px;">${escapeHtml(args.title)}</h2>
              <ul style="margin:0; padding-left:18px;">${listHtml}</ul>
              ${actionHtml}
              <p style="margin:16px 0 0 0; color:#6b7280; font-size:12px;">This message was sent automatically. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody =
      `${args.title}\n\n` +
      args.lines.filter(Boolean).join('\n') +
      (args.actionUrl ? `\n\nOpen: ${args.actionUrl}` : '') +
      `\n\n— ${brandName}\n`;

    await this.client.sendEmail({
      From: from,
      To: args.to,
      Subject: args.subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      ReplyTo: replyTo,
      MessageStream: 'outbound',
      Tag: args.tag,
      TrackOpens: true,
      TrackLinks: 'HtmlOnly' as any,
      Metadata: Object.fromEntries(
        Object.entries(args.metadata).map(([k, v]) => [k, String(v)]),
      ),
      Headers: [
        { Name: 'X-PM-Sender', Value: techSender }, // ✅ lets you track “technical sender”
      ],
    });
  }

  // async sendStatusNotificationEmail(args: {
  //   to: string;
  //   subject: string;
  //   title: string;
  //   lines: string[];
  //   tag: string;
  //   metadata: Record<string, string>;
  // }) {
  //   const from =
  //     process.env.MAIL_FROM || 'Omega LIMS <no-reply@omegabiochemlab.com>';

  //   const replyTo = process.env.MAIL_REPLY_TO || 'no-reply@omegabiochemlab.com';

  //   const brandName = process.env.MAIL_BRAND_NAME || 'Omega Biochem';
  //   const brandSubtitle = 'Report notification';

  //   const htmlLines = args.lines
  //     .map((l) => `<li style="margin:6px 0;">${escapeHtml(l)}</li>`)
  //     .join('');

  //   const htmlBody = `
  // <div style="background:#f3f6fb; padding:24px 0;">
  //   <div style="max-width:640px; margin:0 auto; background:#fff; border:1px solid #e6eaf2; border-radius:14px; overflow:hidden;">
  //     <div style="background:#0b3a83; padding:18px 22px;">
  //       <div style="font-family:Arial; color:#fff; font-size:18px; font-weight:700;">${escapeHtml(brandName)}</div>
  //       <div style="font-family:Arial; color:#dbe8ff; font-size:13px; font-weight:600; margin-top:4px;">${escapeHtml(brandSubtitle)}</div>
  //     </div>
  //     <div style="padding:22px; font-family:Arial; color:#111827; font-size:14px; line-height:1.6;">
  //       <h2 style="margin:0 0 12px 0; font-size:16px;">${escapeHtml(args.title)}</h2>
  //       <ul style="margin:0; padding-left:18px;">${htmlLines}</ul>
  //       <p style="margin:16px 0 0 0; color:#6b7280; font-size:12px;">This message was sent automatically.</p>
  //     </div>
  //   </div>
  // </div>
  // `;

  //   const textBody = `${args.title}\n\n${args.lines.join('\n')}\n\n— ${brandName}\n`;

  //   await this.client.sendEmail({
  //     From: from,
  //     To: args.to,
  //     Subject: args.subject,
  //     HtmlBody: htmlBody,
  //     TextBody: textBody,
  //     ReplyTo: replyTo,
  //     Headers: [{ Name: 'X-PM-Sender', Value: 'tech@omegabiochemlab.com' }],
  //     MessageStream: 'outbound',
  //     Tag: args.tag,
  //     TrackOpens: true,
  //     TrackLinks: 'HtmlOnly' as any,
  //     Metadata: Object.fromEntries(
  //       Object.entries(args.metadata).map(([k, v]) => [k, String(v)]),
  //     ),
  //   });
  // }
}
