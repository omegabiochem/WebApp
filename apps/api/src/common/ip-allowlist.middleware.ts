// import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';

// function getClientIp(req: any) {
//   // 1️⃣ Cloudflare real client IP (MOST IMPORTANT)
//   const cf = req.headers['cf-connecting-ip'];
//   if (cf) return String(cf).trim();

//   // 2️⃣ Standard proxy header
//   const xff = req.headers['x-forwarded-for'];
//   if (xff) return String(xff).split(',')[0].trim();

//   // 3️⃣ Fallback
//   return req.ip;
// }

// function normalizeIp(ip: string) {
//   const s = String(ip || '').trim();

//   // Convert IPv4-mapped IPv6 ::ffff:50.74.254.50 -> 50.74.254.50
//   const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
//   if (m) return m[1];

//   return s;
// }

// @Injectable()
// export class IpAllowlistMiddleware implements NestMiddleware {
//   use(req: any, _res: any, next: () => void) {
//     const enabled = process.env.IP_ALLOWLIST_ENABLED === 'true';

//     const ip = normalizeIp(getClientIp(req));

//     const allow = (process.env.IP_ALLOWLIST || '')
//       .split(',')
//       .map((s) => s.trim())
//       .filter(Boolean);

//     // 🔎 DEBUG LOGS (VERY IMPORTANT)
//     // console.log("[IP_ALLOWLIST]", {
//     //   enabled,
//     //   ip,
//     //   allow,
//     //   cf: req.headers["cf-connecting-ip"],
//     //   xff: req.headers["x-forwarded-for"],
//     //   path: req.originalUrl,
//     // });

//     // 🚪 If not enabled → allow everything
//     if (!enabled) return next();

//     // 🚫 If enabled and IP not in allowlist → BLOCK
//     if (!allow.includes(ip)) {
//       console.warn('[IP_ALLOWLIST_BLOCKED]', ip);
//       throw new ForbiddenException({
//         code: 'IP_NOT_ALLOWED',
//         message:
//           'Access restricted: your network is not allowed to access Omega LIMS.',
//       });
//     }

//     // ✅ Allowed
//     next();
//   }
// }
import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';

function getClientIp(req: any) {
  // 1️⃣ Cloudflare real client IP (MOST IMPORTANT)
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();

  // 2️⃣ Standard proxy header
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();

  // 3️⃣ Fallback
  return req.ip;
}

function normalizeIp(ip: string) {
  // remove zone index like: fe80::1%en0
  return ip.split('%')[0].trim();
}

function isIpv6(ip: string) {
  return ip.includes(':');
}

function ipv6First4Blocks(ip: string) {
  // We only support "normal" full IPv6 here.
  // If you want to support '::' compressed IPv6 perfectly, tell me and I’ll give you a robust parser.
  const clean = normalizeIp(ip).toLowerCase();

  // If it's compressed (contains ::), we won't safely compute first 4 hextets without expansion
  // We'll just return null so it falls back to exact match (or blocked).
  if (clean.includes('::')) return null;

  const parts = clean.split(':').filter(Boolean);
  if (parts.length < 4) return null;

  return parts.slice(0, 4).join(':');
}

@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const enabled = process.env.IP_ALLOWLIST_ENABLED === 'true';

    const rawIp = getClientIp(req);
    const ip = normalizeIp(String(rawIp || ''));

    const allow = (process.env.IP_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!enabled) return next();

    const ipLower = ip.toLowerCase();

    // ✅ Match rules:
    // - IPv4: exact match
    // - IPv6: allow exact match OR match first 4 blocks (prefix)
    let allowed = false;

    if (!isIpv6(ipLower)) {
      // IPv4
      allowed = allow.includes(ipLower);
    } else {
      // IPv6
      const p4 = ipv6First4Blocks(ipLower); // like "2600:1f18:abcd:1234"
      allowed =
        allow.includes(ipLower) || // exact
        (p4 ? allow.includes(p4) : false); // prefix
    }

    if (!allowed) {
      console.warn('[IP_ALLOWLIST_BLOCKED]', { ip });
      throw new ForbiddenException({
        code: 'IP_NOT_ALLOWED',
        message:
          'Access restricted: your network is not allowed to access Omega LIMS.',
      });
    }

    next();
  }
}
