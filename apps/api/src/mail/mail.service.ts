// import { Injectable, Logger } from '@nestjs/common';
// import { ServerClient } from 'postmark';

// function escapeHtml(input: string) {
//   return (input ?? '')
//     .replace(/&/g, '&amp;')
//     .replace(/</g, '&lt;')
//     .replace(/>/g, '&gt;')
//     .replace(/"/g, '&quot;')
//     .replace(/'/g, '&#039;');
// }

// type ClientNotifyKind = 'REPORT_UPDATES' | 'MESSAGES';

// @Injectable()
// export class MailService {
//   private readonly log = new Logger(MailService.name);
//   private readonly client: ServerClient;

//   constructor() {
//     if (!process.env.POSTMARK_SERVER_TOKEN) {
//       throw new Error('POSTMARK_SERVER_TOKEN is not set');
//     }
//     this.client = new ServerClient(process.env.POSTMARK_SERVER_TOKEN);
//   }

//   async sendCredentialsEmail(args: {
//     to: string;
//     name?: string | null;
//     userId: string;
//     tempPassword: string;
//     expiresAt: Date;
//   }) {
//     const { to, name, userId, tempPassword, expiresAt } = args;

//     // Visible sender (what recipients see)
//     const from =
//       process.env.MAIL_FROM || 'Omega LIMS <no-reply@omegabiochemlab.com>';

//     // Optional reply-to (where replies go if someone replies)
//     // If you truly want no replies, set MAIL_REPLY_TO=no-reply@... (or omit it).
//     const replyTo = process.env.MAIL_REPLY_TO || undefined;

//     // Branding / support line
//     const brandName = process.env.MAIL_BRAND_NAME || 'Omega Biochem';
//     const brandSubtitle =
//       process.env.MAIL_BRAND_SUBTITLE || 'Account credentials';
//     const supportEmail =
//       process.env.SUPPORT_EMAIL || 'tech@omegabiochemlab.com';

//     // Avoid sending localhost links in real emails
//     const loginUrl =
//       process.env.APP_URL && !process.env.APP_URL.includes('localhost')
//         ? process.env.APP_URL
//         : 'https://www.omegabiochemlab.com';

//     const exp = new Intl.DateTimeFormat('en-US', {
//       year: 'numeric',
//       month: 'short',
//       day: '2-digit',
//       hour: '2-digit',
//       minute: '2-digit',
//       hour12: true,
//       timeZoneName: 'short',
//     }).format(expiresAt);

//     const displayName = name?.trim() ? name.trim() : 'there';

//     const subject = 'Omega LIMS — Your Account Login Credentials';

//     const htmlBody = `
// <!doctype html>
// <html>
// <head>
//   <meta charset="utf-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1" />
//   <title>${escapeHtml(subject)}</title>
// </head>
// <body style="margin:0; padding:0; background:#f3f6fb;">
//   <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f6fb; padding:24px 0;">
//     <tr>
//       <td align="center" style="padding:0 12px;">
//         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px; max-width:640px; background:#ffffff; border:1px solid #e6eaf2; border-radius:14px; overflow:hidden;">

//           <!-- Header -->
//           <tr>
//             <td style="background:#0b3a83; padding:18px 22px;">
//               <div style="font-family: Arial, Helvetica, sans-serif; color:#ffffff; font-size:18px; font-weight:700; line-height:1.2;">
//                 ${escapeHtml(brandName)}
//               </div>
//               <div style="font-family: Arial, Helvetica, sans-serif; color:#dbe8ff; font-size:13px; font-weight:600; margin-top:4px;">
//                 ${escapeHtml(brandSubtitle)}
//               </div>
//             </td>
//           </tr>

//           <!-- Body -->
//           <tr>
//             <td style="padding:22px;">
//               <div style="font-family: Arial, Helvetica, sans-serif; color:#111827; font-size:14px; line-height:1.6;">

//                 <p style="margin:0 0 12px 0;">
//                   Hello <strong>${escapeHtml(displayName)}</strong>,
//                 </p>

//                 <p style="margin:0 0 16px 0;">
//                   An account has been created for you. Use the credentials below to sign in.
//                 </p>

//                 <!-- Credential box -->
//                 <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
//                   style="background:#f6f8fc; border:1px solid #e6eaf2; border-radius:12px; padding:14px;">
//                   <tr>
//                     <td style="font-family: Arial, Helvetica, sans-serif; font-size:14px; color:#111827; line-height:1.7;">

//                       <div style="margin:0 0 8px 0;">
//                         <span style="color:#374151;">Login URL:</span>
//                         <a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener noreferrer"
//                           style="color:#0b3a83; font-weight:700; text-decoration:none;">
//                           ${escapeHtml(loginUrl)}
//                         </a>
//                       </div>

//                       <div style="margin:0 0 8px 0;">
//                         <span style="color:#374151;">User ID:</span>
//                         <span style="font-weight:700;">${escapeHtml(userId)}</span>
//                       </div>

//                       <div style="margin:0 0 8px 0;">
//                         <span style="color:#374151;">Temporary password:</span>
//                         <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:700;">
//                           ${escapeHtml(tempPassword)}
//                         </span>
//                       </div>

//                       <div style="margin:0;">
//                         <span style="color:#374151;">Expires:</span>
//                         <span style="font-weight:700;">${escapeHtml(exp)}</span>
//                       </div>

//                     </td>
//                   </tr>
//                 </table>

//                 <p style="margin:16px 0 0 0;">
//                   For security, you will be required to change your password after signing in.
//                 </p>

//                 <p style="margin:14px 0 0 0; color:#374151;">
//                   If you did not expect this email, please contact support at
//                   <a href="mailto:${escapeHtml(supportEmail)}" style="color:#0b3a83; font-weight:700; text-decoration:none;">
//                     ${escapeHtml(supportEmail)}
//                   </a>.
//                 </p>

//               </div>
//             </td>
//           </tr>

//           <!-- Footer -->
//           <tr>
//             <td style="border-top:1px solid #eef2f7; padding:14px 22px;">
//               <div style="font-family: Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px; line-height:1.4;">
//                 © ${new Date().getFullYear()} <strong style="color:#111827;">${escapeHtml(brandName)}</strong>. This message was sent automatically.
//               </div>
//             </td>
//           </tr>

//         </table>
//       </td>
//     </tr>
//   </table>
// </body>
// </html>
// `;

//     const textBody = `Hello ${displayName},

// An account has been created for you. Use the credentials below to sign in.

// Login URL: ${loginUrl}
// User ID: ${userId}
// Temporary password: ${tempPassword}
// Expires: ${exp}

// For security, you will be required to change your password after signing in.

// If you did not expect this email, contact support at ${supportEmail}.

// — ${brandName}
// `;

//     await this.client.sendEmail({
//       From: from,
//       To: to,
//       Subject: subject,
//       HtmlBody: htmlBody,
//       TextBody: textBody,
//       Headers: [{ Name: 'X-PM-Sender', Value: 'tech@omegabiochemlab.com' }],
//       MessageStream: 'outbound',
//       ReplyTo: 'no-reply@omegabiochemlab.com',
//       Tag: 'credentials',
//       TrackOpens: true,
//       TrackLinks: 'HtmlAndText' as any,
//       Metadata: {
//         userId: String(userId),
//         emailType: 'credentials',
//         app: 'omega-lims',
//       },
//     });

//     this.log.log(`Credentials email sent via Postmark to ${to}`);
//     this.log.log(
//       `Credentials email accepted by Postmark (${process.env.POSTMARK_SERVER_NAME ?? 'unknown server'}) for ${to}`,
//     );
//   }

//   async sendStatusNotificationEmail(args: {
//     to: string | string[];
//     subject: string;
//     title: string;
//     lines: string[];
//     actionUrl?: string;
//     actionLabel?: string;
//     tag: string;
//     metadata: Record<string, any>;
//   }) {
//     const from =
//       process.env.MAIL_FROM || 'Omega LIMS <no-reply@omegabiochemlab.com>';
//     const replyTo = process.env.MAIL_REPLY_TO || 'no-reply@omegabiochemlab.com';
//     const techSender =
//       process.env.MAIL_TECH_SENDER || 'tech@omegabiochemlab.com';

//     const brandName = process.env.MAIL_BRAND_NAME || 'Omega BioChem Lab';
//     const brandSubtitle =
//       process.env.MAIL_BRAND_SUBTITLE || 'Omega LIMS Notifications';

//     const listHtml = args.lines
//       .filter(Boolean)
//       .map((l) => `<li style="margin:6px 0;">${escapeHtml(String(l))}</li>`)
//       .join('');

//     const actionHtml = args.actionUrl
//       ? `
//       <div style="margin-top:16px;">
//         <a href="${escapeHtml(args.actionUrl)}"
//            style="display:inline-block; background:#0b3a83; color:#fff; text-decoration:none; font-weight:700;
//                   padding:10px 14px; border-radius:10px;">
//           ${escapeHtml(args.actionLabel || 'Open')}
//         </a>
//       </div>
//     `
//       : '';

//     const htmlBody = `
// <!doctype html>
// <html>
// <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
// <body style="margin:0; padding:0; background:#f3f6fb;">
//   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb; padding:24px 0;">
//     <tr>
//       <td align="center" style="padding:0 12px;">
//         <table role="presentation" width="640" cellpadding="0" cellspacing="0"
//                style="width:640px; max-width:640px; background:#fff; border:1px solid #e6eaf2;
//                       border-radius:14px; overflow:hidden;">
//           <tr>
//             <td style="background:#0b3a83; padding:18px 22px;">
//               <div style="font-family:Arial; color:#fff; font-size:18px; font-weight:800;">${escapeHtml(brandName)}</div>
//               <div style="font-family:Arial; color:#dbe8ff; font-size:13px; font-weight:600; margin-top:4px;">${escapeHtml(brandSubtitle)}</div>
//             </td>
//           </tr>
//           <tr>
//             <td style="padding:22px; font-family:Arial; color:#111827; font-size:14px; line-height:1.6;">
//               <h2 style="margin:0 0 12px 0; font-size:16px;">${escapeHtml(args.title)}</h2>
//               <ul style="margin:0; padding-left:18px;">${listHtml}</ul>
//               ${actionHtml}
//               <p style="margin:16px 0 0 0; color:#6b7280; font-size:12px;">This message was sent automatically. Please do not reply.</p>
//             </td>
//           </tr>
//         </table>
//       </td>
//     </tr>
//   </table>
// </body>
// </html>`;

//     const textBody =
//       `${args.title}\n\n` +
//       args.lines.filter(Boolean).join('\n') +
//       (args.actionUrl ? `\n\nOpen: ${args.actionUrl}` : '') +
//       `\n\n— ${brandName}\n`;

//     const toList = Array.isArray(args.to) ? args.to : [args.to];
//     if (toList.length === 0) return;

//     await this.client.sendEmail({
//       From: from,

//       // ✅ Keep To as your system mailbox, put clients in Bcc for privacy
//       // To: process.env.MAIL_TO_FALLBACK || 'tech@omegabiochemlab.com',
//       // // Bcc: toList.join(','),

//       //       To: 'undisclosed-recipients@omegabiochemlab.com',
//       // Bcc: toList.join(','),

//       To: toList.join(','),

//       Subject: args.subject,
//       HtmlBody: htmlBody,
//       TextBody: textBody,
//       ReplyTo: replyTo,
//       MessageStream: 'outbound',
//       Tag: args.tag,
//       TrackOpens: true,
//       TrackLinks: 'HtmlOnly' as any,
//       Metadata: Object.fromEntries(
//         Object.entries(args.metadata).map(([k, v]) => [k, String(v)]),
//       ),
//       Headers: [
//         { Name: 'X-PM-Sender', Value: techSender }, // ✅ lets you track “technical sender”
//       ],
//     });
//   }
// }

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

type ClientNotifyKind = 'REPORT_UPDATES' | 'MESSAGES';

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
    const replyTo = process.env.MAIL_REPLY_TO || undefined;

    // Branding / support line
    const brandName = process.env.MAIL_BRAND_NAME || 'Omega Biochem';
    const brandSubtitle =
      process.env.MAIL_BRAND_SUBTITLE || 'Account credentials';
    const supportEmail =
      process.env.SUPPORT_EMAIL || 'tech@omegabiochemlab.com';

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

    // NOTE:
    // Most email clients block JavaScript. We implement:
    // - A copy icon UI next to User ID + Temporary password
    // - Click-to-select works via a small onclick handler (ignored in strict clients)
    // Even when onclick/JS is blocked, the icon still shows and users can select/copy manually.
    const htmlBody = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
  <style>
    .copyWrap { display:inline-flex; align-items:center; gap:8px; vertical-align:middle; }
    .copyCode {
      display:inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-weight:700;
      background:#eef2ff;
      border:1px solid #dbeafe;
      padding:4px 8px;
      border-radius:8px;
      color:#111827;
      user-select: all;
      -webkit-user-select: all;
      -ms-user-select: all;
    }
    .copyBtn {
      display:inline-block;
      font-family: Arial, Helvetica, sans-serif;
      font-size:12px;
      font-weight:800;
      line-height:1;
      padding:6px 8px;
      border-radius:8px;
      border:1px solid #e6eaf2;
      background:#ffffff;
      color:#0b3a83;
      text-decoration:none;
      cursor:pointer;
      user-select:none;
      -webkit-user-select:none;
    }
    .mutedHint { color:#6b7280; font-size:12px; margin-top:6px; }
  </style>
  <script>
    // Best-effort: copy to clipboard where allowed; otherwise select text.
    function omegaCopy(id) {
      try {
        var el = document.getElementById(id);
        if (!el) return;
        var text = (el.innerText || el.textContent || '').trim();

        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(function(){});
        }

        // Always select for easy Ctrl+C fallback
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {
        // ignore
      }
    }
  </script>
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

                      <div style="margin:0 0 10px 0;">
                        <span style="color:#374151;">Login URL:</span>
                        <a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener noreferrer"
                          style="color:#0b3a83; font-weight:700; text-decoration:none;">
                          ${escapeHtml(loginUrl)}
                        </a>
                      </div>

                      <!-- User ID with copy -->
                      <div style="margin:0 0 10px 0;">
                        <span style="color:#374151;">User ID:</span>
                        <span class="copyWrap" onclick="omegaCopy('omega_uid')" title="Click to copy / select">
                          <span id="omega_uid" class="copyCode">${escapeHtml(userId)}</span>
                          
                        </span>
                      </div>

                      <!-- Temporary password with copy -->
                      <div style="margin:0 0 10px 0;">
                        <span style="color:#374151;">Temporary password:</span>
                        <span class="copyWrap" onclick="omegaCopy('omega_pwd')" title="Click to copy / select">
                          <span id="omega_pwd" class="copyCode">${escapeHtml(tempPassword)}</span>
                          
                        </span>
                        <div class="mutedHint">Tip: If copy doesn’t work, click the value to select it and press Ctrl+C.</div>
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
      ReplyTo: replyTo ?? 'no-reply@omegabiochemlab.com',
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
    to: string | string[];
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

    const toList = Array.isArray(args.to) ? args.to : [args.to];
    if (toList.length === 0) return;

    await this.client.sendEmail({
      From: from,
      To: toList.join(','),
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
      Headers: [{ Name: 'X-PM-Sender', Value: techSender }],
    });
  }

  async sendTwoFactorOtpEmail(args: {
    to: string;
    name?: string | null;
    code: string;
    expiresAt: Date;
    purpose?: string; // optional: "Login verification"
  }) {
    const { to, name, code, expiresAt } = args;

    const from =
      process.env.MAIL_FROM || 'Omega LIMS <no-reply@omegabiochemlab.com>';
    const replyTo = process.env.MAIL_REPLY_TO || 'no-reply@omegabiochemlab.com';

    const brandName = process.env.MAIL_BRAND_NAME || 'Omega BioChem Lab';
    const supportEmail =
      process.env.SUPPORT_EMAIL || 'tech@omegabiochemlab.com';

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
    const subject = 'Omega LIMS — Your verification code';

    const htmlBody = `
<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0; padding:0; background:#f3f6fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb; padding:24px 0;">
    <tr><td align="center" style="padding:0 12px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0"
             style="width:640px; max-width:640px; background:#fff; border:1px solid #e6eaf2; border-radius:14px; overflow:hidden;">
        <tr>
          <td style="background:#0b3a83; padding:18px 22px;">
            <div style="font-family:Arial; color:#fff; font-size:18px; font-weight:800;">${escapeHtml(brandName)}</div>
            <div style="font-family:Arial; color:#dbe8ff; font-size:13px; font-weight:600; margin-top:4px;">Two-Factor Verification</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px; font-family:Arial; color:#111827; font-size:14px; line-height:1.6;">
            <p style="margin:0 0 10px 0;">Hello <strong>${escapeHtml(displayName)}</strong>,</p>
            <p style="margin:0 0 12px 0;">Use this verification code to complete your sign-in:</p>

            <div style="display:inline-block; font-size:24px; font-weight:900; letter-spacing:6px;
                        background:#f6f8fc; border:1px solid #e6eaf2; padding:10px 14px; border-radius:12px;">
              ${escapeHtml(code)}
            </div>

            <p style="margin:12px 0 0 0; color:#374151;">This code expires at <strong>${escapeHtml(exp)}</strong>.</p>
            <p style="margin:14px 0 0 0; color:#6b7280; font-size:12px;">
              If you did not request this code, please contact support at
              <a href="mailto:${escapeHtml(supportEmail)}" style="color:#0b3a83; font-weight:700; text-decoration:none;">
                ${escapeHtml(supportEmail)}
              </a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textBody = `Hello ${displayName},

Your Omega LIMS verification code is: ${code}

Expires: ${exp}

If you did not request this, contact support: ${supportEmail}
— ${brandName}
`;

    await this.client.sendEmail({
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      ReplyTo: replyTo,
      MessageStream: 'outbound',
      Tag: '2fa',
      TrackOpens: true,
      TrackLinks: 'HtmlAndText' as any,
      Metadata: { emailType: '2fa', app: 'omega-lims' },
    });

    this.log.log(`2FA email OTP sent to ${to}`);
  }
}
