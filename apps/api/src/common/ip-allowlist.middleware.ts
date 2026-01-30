import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";

function getClientIp(req: any) {
  // Cloudflare real client IP
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return String(cf).trim();

  // standard proxy header
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();

  return req.ip;
}

@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const enabled = process.env.IP_ALLOWLIST_ENABLED === "true";
    if (!enabled) return next();

    const allow = (process.env.IP_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const ip = getClientIp(req);

    if (!allow.includes(ip)) {
      throw new ForbiddenException("Access restricted: IP not allowed");
    }

    next();
  }
}
