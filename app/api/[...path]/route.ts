import { handleApi } from "../../../src/server-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function route(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Next can construct request.url from the internal listener hostname.
  // Browsers send their public Host and Origin, including the local port.
  const vercel = process.env.VERCEL === "1";
  if (vercel) url.protocol = "https:";
  if (host) {
    url.port = "";
    url.host = host;
  }
  const clientIp = vercel ? request.headers.get("x-vercel-forwarded-for") : null;
  return handleApi(request, { DATABASE_URL: process.env.DATABASE_URL }, { url, clientIp: clientIp || "local" });
}

export { route as GET, route as POST, route as PATCH };
