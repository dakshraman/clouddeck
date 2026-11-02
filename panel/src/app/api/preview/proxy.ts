import http from "node:http";
import { NextResponse, type NextRequest } from "next/server";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function render502(domain: string): NextResponse {
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

export async function proxyPreview(req: NextRequest, rawDomain: string, subpath: string): Promise<NextResponse> {
  await requireAuth();

  const domain = decodeDomainParam(rawDomain);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }

  const formattedPath = subpath ? (subpath.startsWith("/") ? subpath : `/${subpath}`) : "/";
  const search = req.nextUrl.search || "";
  const requestPath = `${formattedPath}${search}`;

  const forwardHeaders: Record<string, string | string[]> = {};
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
    forwardHeaders[key] = value;
  }

  // Force Host header so Nginx correctly routes to the virtual host!
  forwardHeaders["host"] = domain;
  forwardHeaders["x-forwarded-host"] = domain;
  forwardHeaders["x-forwarded-proto"] = "http";
  forwardHeaders["x-forwarded-for"] = req.headers.get("x-forwarded-for") || "127.0.0.1";
  // Request uncompressed response so HTML link rewriting can be performed reliably
  forwardHeaders["accept-encoding"] = "identity";

  let bodyBuffer: Buffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 0) {
        bodyBuffer = Buffer.from(buf);
        forwardHeaders["content-length"] = String(bodyBuffer.byteLength);
      }
    } catch {
      // no body
    }
  }

  return new Promise<NextResponse>((resolve) => {
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: 80,
        path: requestPath,
        method: req.method,
        headers: forwardHeaders,
        timeout: 15000,
      },
      (clientRes) => {
        const chunks: Buffer[] = [];
        clientRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        clientRes.on("end", () => {
          const rawBody = Buffer.concat(chunks);
          const responseHeaders = new Headers();

          for (const [key, val] of Object.entries(clientRes.headers)) {
            if (!val) continue;
            const lower = key.toLowerCase();
            if (
              lower === "content-encoding" ||
              lower === "content-length" ||
              lower === "transfer-encoding" ||
              lower === "connection"
            ) {
              continue;
            }

            if (lower === "location") {
              let loc = Array.isArray(val) ? val[0] : val;
              try {
                const parsed = new URL(loc, `http://${domain}`);
                if (
                  parsed.hostname === domain ||
                  parsed.hostname === `www.${domain}` ||
                  parsed.hostname === "localhost" ||
                  parsed.hostname === "127.0.0.1"
                ) {
                  loc = `/api/preview/${encodeURIComponent(domain)}${parsed.pathname}${parsed.search}${parsed.hash}`;
                }
              } catch {
                if (loc.startsWith("/")) {
                  loc = `/api/preview/${encodeURIComponent(domain)}${loc}`;
                }
              }
              responseHeaders.set("location", loc);
              continue;
            }

            if (lower === "set-cookie") {
              const cookies = Array.isArray(val) ? val : [val];
              for (let c of cookies) {
                // Strip domain restriction so cookie works on localhost preview
                c = c.replace(/;\s*Domain=[^;]+/gi, "");
                responseHeaders.append("set-cookie", c);
              }
              continue;
            }

            if (Array.isArray(val)) {
              for (const v of val) {
                responseHeaders.append(key, v);
              }
            } else {
              responseHeaders.set(key, val);
            }
          }

          const contentType = clientRes.headers["content-type"] || "";
          let finalBody: Uint8Array = rawBody;

          // Rewrite root-relative links in HTML so subresources and navigation stay inside preview proxy
          if (contentType.includes("text/html")) {
            let html = rawBody.toString("utf-8");
            const domainEsc = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Rewrite absolute domain references
            html = html.replace(
              new RegExp(`https?://${domainEsc}(?::\\d+)?(/[^"'\\s<>]*)?`, "gi"),
              (match, p) => `/api/preview/${encodeURIComponent(domain)}${p || "/"}`
            );
            // Rewrite root-relative href, src, action (excluding protocol-relative and already proxied)
            html = html.replace(
              /(href|src|action)=["']\/(?!\/|api\/preview\/)([^"']*)["']/gi,
              `$1="/api/preview/${encodeURIComponent(domain)}/$2"`
            );
            finalBody = Buffer.from(html, "utf-8");
          }

          resolve(
            new NextResponse(finalBody as unknown as BodyInit, {
              status: clientRes.statusCode ?? 200,
              statusText: clientRes.statusMessage ?? "OK",
              headers: responseHeaders,
            })
          );
        });
      }
    );

    proxyReq.on("error", () => {
      resolve(render502(domain));
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      resolve(render502(domain));
    });

    if (bodyBuffer) {
      proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
  });
}
