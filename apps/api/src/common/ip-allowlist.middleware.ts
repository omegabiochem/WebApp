import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';

/**
 * IPv4-only allowlist middleware.
 *
 * - Reads client IP from Cloudflare header first (cf-connecting-ip)
 * - Falls back to x-forwarded-for, then req.ip
 * - Normalizes IPv4-mapped IPv6 (::ffff:1.2.3.4 -> 1.2.3.4)
 * - Blocks all non-IPv4 (IPv6) traffic
 * - Allows only IPs listed in IP_ALLOWLIST (comma-separated)
 *
 * ENV:
 * - IP_ALLOWLIST_ENABLED=true|false
 * - IP_ALLOWLIST=1.2.3.4,5.6.7.8
 * - IP_ALLOWLIST_DEBUG=true|false (optional)
 * - IP_ALLOWLIST_ALLOW_LOCAL=true|false (optional)
 */
function getClientIp(req: any) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();

  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();

  return String(req.ip || '').trim();
}

function normalizeIp(ipRaw: string) {
  let ip = (ipRaw || '').trim();

  // IPv4-mapped IPv6: ::ffff:1.2.3.4 -> 1.2.3.4
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);

  // remove zone index if present: fe80::1%lo0 -> fe80::1
  if (ip.includes('%')) ip = ip.split('%')[0];

  return ip;
}

function isValidIpv4(ip: string) {
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  return ipv4Regex.test(ip);
}

function parseAllowlist(raw: string | undefined) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const enabled = process.env.IP_ALLOWLIST_ENABLED === 'true';
    if (!enabled) return next();

    const raw = getClientIp(req);
    const ip = normalizeIp(raw);

    const debug = process.env.IP_ALLOWLIST_DEBUG === 'true';
    const allowLocal = process.env.IP_ALLOWLIST_ALLOW_LOCAL === 'true';
    const allow = parseAllowlist(process.env.IP_ALLOWLIST);

    if (debug) {
      console.log('[IP_ALLOWLIST_DEBUG]', {
        enabled,
        raw,
        ip,
        reqIp: req.ip,
        cf: req.headers['cf-connecting-ip'],
        xff: req.headers['x-forwarded-for'],
        allow,
        path: req.originalUrl,
        method: req.method,
      });
    }

    // Optional: allow local dev calls without listing 127.0.0.1
    // Keep this OFF in staging/prod.
    if (allowLocal && (ip === '127.0.0.1' || ip === '::1')) {
      return next();
    }

    // ✅ IPv4-only gate
    if (!isValidIpv4(ip)) {
      throw new ForbiddenException({
        code: 'IP_NOT_IPV4',
        message: `Only IPv4 allowed. Detected: ${ip}`,
      });
    }

    // ✅ Allowlist enforcement
    if (!allow.includes(ip)) {
      console.warn('[IP_ALLOWLIST_BLOCKED]', { ip, raw, path: req.originalUrl });
      throw new ForbiddenException({
        code: 'IP_NOT_ALLOWED',
        message: `Access restricted: ${ip} not in allowlist.`,
      });
    }

    return next();
  }
}