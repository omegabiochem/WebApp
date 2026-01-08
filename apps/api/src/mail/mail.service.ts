import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true for 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendCredentialsEmail(args: {
    to: string;
    name?: string | null;
    userId: string;
    tempPassword: string;
    expiresAt: Date;
  }) {
    const { to, name, userId, tempPassword, expiresAt } = args;

    const appUrl = process.env.APP_URL || "https://www.omegabiochemlab.com";
    const exp = expiresAt.toLocaleString();

    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || "Omega LIMS <no-reply@omegabiochemlab.com>",
      to,
      subject: "Your Omega LIMS login credentials",
      html: `
        <p>Hello${name ? ` ${name}` : ""},</p>
        <p>Your Omega LIMS account has been created.</p>

        <p><b>Login URL:</b> <a href="${appUrl}">${appUrl}</a></p>
        <p><b>User ID:</b> ${userId}</p>
        <p><b>Temporary Password:</b> ${tempPassword}</p>

        <p><b>Temporary password expires:</b> ${exp}</p>
        <p>You will be required to change your password after signing in.</p>
      `,
    });

    this.log.log(`Credentials email sent to ${to}`);
  }
}
