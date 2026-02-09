
import { Injectable } from '@nestjs/common';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private client: Twilio;
  private messagingServiceSid: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const mgSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken || !mgSid) {
      throw new Error('Twilio environment variables are not properly set');
    }

    // ✅ MUST start with AC
    if (!accountSid.startsWith('AC')) {
      throw new Error('TWILIO_ACCOUNT_SID must start with AC');
    }

    this.client = twilio(accountSid, authToken);
    this.messagingServiceSid = mgSid;
  }

  async sendOtp(toPhone: string, code: string) {
    const msg = `Your Omega Biochem Laboratories verification code is ${code}. This code expires in 10 minutes. Reply STOP to opt out. HELP for support.`;

    return this.client.messages.create({
      to: toPhone,
      body: msg,
      messagingServiceSid: this.messagingServiceSid, // ✅ A2P compliant
    });
  }
}
