import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";

function getClientIp(req: any) {
  // 1️⃣ Cloudflare real client IP (MOST IMPORTANT)
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return String(cf).trim();

  // 2️⃣ Standard proxy header
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();

  // 3️⃣ Fallback
  return req.ip;
}

@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const enabled = process.env.IP_ALLOWLIST_ENABLED === "true";

    const ip = getClientIp(req);

    const allow = (process.env.IP_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // 🔎 DEBUG LOGS (VERY IMPORTANT)
    console.log("[IP_ALLOWLIST]", {
      enabled,
      ip,
      allow,
      cf: req.headers["cf-connecting-ip"],
      xff: req.headers["x-forwarded-for"],
      path: req.originalUrl,
    });

    // 🚪 If not enabled → allow everything
    if (!enabled) return next();

    // 🚫 If enabled and IP not in allowlist → BLOCK
    if (!allow.includes(ip)) {
      console.warn("[IP_ALLOWLIST_BLOCKED]", ip);
      throw new ForbiddenException("Access restricted: IP not allowed");
    }

    // ✅ Allowed
    next();
  }
}
