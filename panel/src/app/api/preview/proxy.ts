import { NextResponse, type NextRequest } from "next/server";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function proxyPreview(req: NextRequest, rawDomain: string, subpath: string): Promise<NextResponse> {
  await requireAuth();

  const domain = decodeDomainParam(rawDomain);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }

  const formattedPath = subpath ? (subpath.startsWith("/") ? subpath : `/${subpath}`) : "/";
  const search = req.nextUrl.search || "";
  const targetUrl = `http://127.0.0.1:80${formattedPath}${search}`;

  const upstreamHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "keep-alive" ||
      lower === "transfer-encoding" ||
      lower === "content-length"
    ) {
      continue;
    }
    upstreamHeaders.set(key, value);
  }
  upstreamHeaders.set("Host", domain);
  upstreamHeaders.set("X-Forwarded-Host", domain);
  upstreamHeaders.set("X-Forwarded-Proto", "http");

  let body: ArrayBuffer | undefined = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 0) {
        body = buf;
      }
    } catch {
      // no body
    }
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const accept = req.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      return new NextResponse(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>502 Bad Gateway - CloudDeck Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #f87171; font-size: 22px; margin-top: 0; margin-bottom: 12px; font-weight: 600; }
    p { color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 8px 0; }
    .code { background: #1e293b; padding: 3px 8px; border-radius: 4px; font-family: monospace; color: #38bdf8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>502 Bad Gateway</h1>
    <p>Unable to connect to the local web server on <span class="code">127.0.0.1:80</span>.</p>
    <p>Ensure Nginx is running and configured for domain <strong style="color:#fff">${domain}</strong>.</p>
  </div>
</body>
</html>`,
        {
          status: 502,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }
    return NextResponse.json(
      { error: { message: `Local web server is unreachable for domain ${domain}` } },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  for (const [key, value] of res.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === "content-encoding" ||
      lower === "content-length" ||
      lower === "transfer-encoding" ||
      lower === "connection"
    ) {
      continue;
    }
    responseHeaders.set(key, value);
  }

  const resBody = await res.arrayBuffer();
  return new NextResponse(resBody, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}
