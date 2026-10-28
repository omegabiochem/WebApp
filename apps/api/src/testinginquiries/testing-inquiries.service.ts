import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';

const TESTS = new Set(['Microbiology', 'Chemistry', 'Sterility', 'APE', 'Other']);
const TURNAROUNDS = new Set(['STANDARD', 'URGENT', 'DISCUSS']);

type InquiryBody = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  testingTypes: string[];
  productType?: string;
  sampleCount?: number;
  requirements: string;
  turnaround: string;
  consent: true;
  website?: string; // honeypot
};

function textField(value: unknown, max: number, required = false): string {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new BadRequestException('Invalid form data');
  }
  const valueText = typeof value === 'string' ? value.trim() : '';
  if (valueText.length > max || (required && !valueText)) {
    throw new BadRequestException('Please complete all required fields within the limits');
  }
  return valueText;
}

@Injectable()
export class TestingInquiriesService {
  private readonly log = new Logger(TestingInquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async submit(raw: unknown, remoteIp: string) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Invalid form');
    }
    const r = raw as Record<string, unknown>;
    if (textField(r.website, 200)) {
      // Do not send mail or persist bot submissions.
      return { submitted: true };
    }

    const companyName = textField(r.companyName, 150, true);
    const contactName = textField(r.contactName, 150, true);
    const email = textField(r.email, 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }
    const phone = textField(r.phone, 40) || null;
    const productType = textField(r.productType, 200) || null;
    const requirements = textField(r.requirements, 4000, true);
    if (requirements.length < 10) {
      throw new BadRequestException('Please describe your testing requirements');
    }
    if (!Array.isArray(r.testingTypes) || r.testingTypes.length === 0 || r.testingTypes.length > 5 ||
      r.testingTypes.some((t) => typeof t !== 'string' || !TESTS.has(t))) {
      throw new BadRequestException('Select at least one valid testing type');
    }
    const testingTypes = [...new Set(r.testingTypes as string[])];
    if (r.sampleCount !== undefined &&
        (!Number.isInteger(r.sampleCount) || (r.sampleCount as number) < 1 || (r.sampleCount as number) > 1000000)) {
      throw new BadRequestException('Invalid number of samples');
    }
    const turnaround = textField(r.turnaround, 20, true);
    if (!TURNAROUNDS.has(turnaround)) {
      throw new BadRequestException('Invalid turnaround preference');
    }
    if (r.consent !== true) {
      throw new BadRequestException('Contact consent is required');
    }

    const ipHash = createHash('sha256')
      .update(`${process.env.TESTING_INQUIRY_HASH_SALT || 'omega-public-inquiry'}:${remoteIp}`)
      .digest('hex');
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.testingInquiry.count({
      where: { ipHash, createdAt: { gte: hourAgo } },
    });
    if (recent >= 3) {
      throw new BadRequestException('Too many inquiries. Please try again later.');
    }

    const body: InquiryBody = {
      companyName, contactName, email, phone: phone || undefined,
      testingTypes, productType: productType || undefined,
      sampleCount: r.sampleCount as number | undefined,
      requirements, turnaround, consent: true,
    };
    const reference = `INQ-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;
    const inquiry = await this.prisma.testingInquiry.create({
      data: {
        reference,
        companyName,
        contactName,
        email,
        phone,
        testingTypes,
        productType,
        sampleCount: body.sampleCount ?? null,
        requirements,
        turnaround,
        consent: true,
        ipHash,
      },
    });

    // Persist first, then send notification. A mail failure must not discard an inquiry.
    // Keep recipient strictly server-controlled, never take it from the public request.
    const to = process.env.TESTING_INQUIRY_TO_EMAIL?.trim();
    if (!to) {
      this.log.error(`TESTING_INQUIRY_TO_EMAIL is not configured; stored ${reference}`);
      await this.prisma.testingInquiry.update({
        where: { id: inquiry.id },
        data: { emailStatus: 'FAILED', emailError: 'Destination email not configured' },
      });
      return { submitted: true, reference };
    }
    try {
      await this.mail.sendStatusNotificationEmail({
        to,
        subject: `[Omega BioChem] New Testing Inquiry — ${reference}`,
        title: 'New Public Laboratory Testing Inquiry',
        badgeText: 'NEW INQUIRY',
        badgeTone: 'BLUE',
        lines: [
          `Reference: ${reference}`,
          `Company: ${body.companyName}`,
          `Contact: ${body.contactName}`,
          `Email: ${body.email}`,
          `Phone: ${body.phone || 'Not provided'}`,
          `Testing types: ${testingTypes.join(', ')}`,
          `Product/sample: ${body.productType || 'Not provided'}`,
          `Number of samples: ${body.sampleCount || 'Not specified'}`,
          `Turnaround: ${body.turnaround}`,
          `Requirements: ${body.requirements}`,
        ],
        tag: 'testing-inquiry',
        metadata: { inquiryId: inquiry.id, reference, emailType: 'testing-inquiry' },
      });
      await this.prisma.testingInquiry.update({
        where: { id: inquiry.id }, data: { emailStatus: 'SENT', emailedAt: new Date(), emailError: null },
      });
    } catch (error) {
      this.log.error(`Inquiry email failed for ${reference}`, error instanceof Error ? error.stack : String(error));
      await this.prisma.testingInquiry.update({
        where: { id: inquiry.id },
        data: { emailStatus: 'FAILED', emailError: String(error).slice(0, 500) },
      });
    }
    return { submitted: true, reference };
  }
}
