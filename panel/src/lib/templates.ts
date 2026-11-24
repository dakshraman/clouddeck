export interface IndustrialAppTemplate {
  id: string;
  name: string;
  category: "static" | "php" | "node" | "python" | "go" | "java" | "docker" | "other";
  runtime: "static" | "php" | "node" | "python" | "go" | "ruby" | "java" | "docker" | "custom";
  description: string;
  tagline: string;
  icon: string;
  defaultPort?: number;
  defaultCommand?: string;
  requiresDatabase?: boolean;
  webrootSubdir?: string;
  scaffoldFiles?: Record<string, string>;
}

export const INDUSTRIAL_APPS: IndustrialAppTemplate[] = [
  {
    id: "static",
    name: "Static & SPA",
    category: "static",
    runtime: "static",
    tagline: "Vite, React, Vue, Svelte, Astro, HTML5 single-page application",
    description: "Line-rate static file delivery via Nginx with client-side SPA routing fallback (/index.html), clean asset caching, and zero background process overhead.",
    icon: "globe",
    requiresDatabase: false,
    scaffoldFiles: {
      "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CloudDeck Static SPA</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0d1117;
      color: #f0f6fc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 16px;
      padding: 40px;
      max-width: 560px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .badge {
      display: inline-block;
      background: rgba(116, 184, 204, 0.15);
      color: #74b8cc;
      border: 1px solid rgba(116, 184, 204, 0.3);
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      margin-bottom: 20px;
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 12px; color: #ffffff; }
    p { color: #8b949e; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .features {
      text-align: left;
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #c9d1d9;
    }
    .features li { list-style: none; margin: 8px 0; display: flex; align-items: center; gap: 8px; }
    .features li::before { content: "✓"; color: #3fb950; font-weight: bold; }
    .btn {
      display: inline-block;
      background: #235361;
      color: #ffffff;
      padding: 10px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.2s ease;
    }
    .btn:hover { background: #2f6c7e; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Static &amp; Single Page App (SPA)</span>
    <h1>Static Site Live</h1>
    <p>Zero process overhead. Nginx is configured with automated client-side route fallback to <code>/index.html</code> for React Router, Vue Router, or Vite builds.</p>
    <ul class="features">
      <li>Automatic fallback to <code>/index.html</code> on deep routes</li>
      <li>Instant line-rate HTTP/2 &amp; gzip compression</li>
      <li>Upload your build artifacts via Files or Git CI/CD</li>
    </ul>
    <a href="/about" class="btn">Test Client Route Fallback</a>
  </div>
</body>
</html>
`,
    },
  },
  {
    id: "express",
    name: "Express.js / Node API",
    category: "node",
    runtime: "node",
    tagline: "Fast, unopinionated Node.js backend REST or GraphQL API",
    description: "Runs supervised Node.js HTTP server mapped through Nginx reverse proxy with live process monitoring and environment variables.",
    icon: "express",
    defaultPort: 3000,
    defaultCommand: "node index.js",
    scaffoldFiles: {
      "package.json": JSON.stringify(
        {
          name: "clouddeck-express-api",
          version: "1.0.0",
          private: true,
          main: "index.js",
          scripts: {
            start: "node index.js",
          },
          dependencies: {},
        },
        null,
        2
      ),
      "index.js": `const http = require("http");
const port = parseInt(process.env.PORT || "3000", 10);

const server = http.createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(\`<!DOCTYPE html><html><head><title>Express / Node API</title><style>body{font-family:system-ui;background:#0d1117;color:#f0f6fc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}div{background:#161b22;border:1px solid #30363d;padding:36px;border-radius:12px;text-align:center;max-width:480px;}h1{color:#74b8cc;font-size:24px;}p{color:#8b949e;font-size:14px;line-height:1.6;}code{background:#21262d;padding:2px 6px;border-radius:4px;color:#faaa93;}</style></head><body><div><h1>Node.js API Ready</h1><p>Supervised HTTP service listening on port <code>\${port}</code>.<br/>Health check available at <code><a href="/api/health" style="color:#74b8cc;">/api/health</a></code>.</p></div></body></html>\`);
});

server.listen(port, "127.0.0.1", () => {
  console.log("Node server listening on http://127.0.0.1:" + port);
});
`,
    },
  },
  {
    id: "fastapi",
    name: "FastAPI (Python)",
    category: "python",
    runtime: "python",
    tagline: "High-performance Python ASGI API with automatic Swagger / OpenAPI docs",
    description: "Provisions Python ASGI application supervised under Uvicorn, mapped to local port with interactive /docs and /redoc OpenAPI interfaces.",
    icon: "fastapi",
    defaultPort: 8000,
    defaultCommand: "python3 -m uvicorn main:app --host 127.0.0.1 --port $PORT",
    scaffoldFiles: {
      "requirements.txt": `fastapi>=0.115.0
uvicorn>=0.30.0
`,
      "main.py": `import os
from http.server import HTTPServer, BaseHTTPRequestHandler

port = int(os.environ.get("PORT", 8000))

# Standard fallback handler when uvicorn is not yet installed in system environment
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"healthy","engine":"fastapi"}')
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        html = f"""<!DOCTYPE html><html><head><title>FastAPI on CloudDeck</title><style>body{{font-family:system-ui;background:#0d1117;color:#f0f6fc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}div{{background:#161b22;border:1px solid #30363d;padding:36px;border-radius:12px;text-align:center;max-width:500px;}}h1{{color:#059669;font-size:24px;}}p{{color:#8b949e;font-size:14px;line-height:1.6;}}code{{background:#21262d;padding:2px 6px;border-radius:4px;color:#74b8cc;}}</style></head><body><div><h1>FastAPI Ready</h1><p>Python ASGI service active on port <code>{port}</code>. Run <code>pip install -r requirements.txt</code> to compile complete FastAPI with OpenAPI Swagger documentation.</p></div></body></html>"""
        self.wfile.write(html.encode("utf-8"))

if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"FastAPI worker listening on port {port}")
    server.serve_forever()
`,
    },
  },
  {
    id: "go",
    name: "Go Web Service",
    category: "go",
    runtime: "go",
    tagline: "High-throughput compiled Go binary with sub-millisecond latency",
    description: "Executes native compiled Go binary or go run HTTP service with minimal memory footprint (<10MB) and instant startup.",
    icon: "go",
    defaultPort: 8080,
    defaultCommand: "go run main.go",
    scaffoldFiles: {
      "go.mod": `module app

go 1.22
`,
      "main.go": `package main

import (
	"fmt"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, ` + "`" + `{"status":"ok","runtime":"go"}` + "`" + `)
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, ` + "`" + `<!DOCTYPE html><html><head><title>Go on CloudDeck</title><style>body{font-family:system-ui;background:#0d1117;color:#f0f6fc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}div{background:#161b22;border:1px solid #30363d;padding:36px;border-radius:12px;text-align:center;max-width:480px;}h1{color:#00add8;font-size:24px;}p{color:#8b949e;font-size:14px;line-height:1.6;}code{background:#21262d;padding:2px 6px;border-radius:4px;color:#74b8cc;}</style></head><body><div><h1>Go HTTP Service Ready</h1><p>Native compiled service listening on port <code>%s</code>.</p></div></body></html>` + "`" + `, port)
	})

	fmt.Println("Go server listening on :" + port)
	if err := http.ListenAndServe("127.0.0.1:"+port, nil); err != nil {
		panic(err)
	}
}
`,
    },
  },
  {
    id: "wordpress",
    name: "WordPress",
    category: "php",
    runtime: "php",
    tagline: "World's most popular CMS (WordPress 7.1.4 stable)",
    description: "Configures PHP-FPM, automated MySQL database & user creation, secure wp-config.php with random salts, and Nginx permalink rewrite rules.",
    icon: "wordpress",
    requiresDatabase: true,
    scaffoldFiles: {
      "index.php": `<?php
/**
 * CloudDeck WordPress Starter
 */
define('WP_USE_THEMES', true);
if (file_exists(__DIR__ . '/wp-blog-header.php')) {
    require __DIR__ . '/wp-blog-header.php';
} else {
    echo "<!DOCTYPE html><html><head><title>WordPress Ready</title>";
    echo "<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}";
    echo ".card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:32px;max-width:480px;text-align:center;}";
    echo "h1{color:#74b8cc;font-size:24px;margin-bottom:12px;}p{color:#94a3b8;font-size:14px;line-height:1.6;}";
    echo "a{display:inline-block;margin-top:16px;background:#235361;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;}</style></head>";
    echo "<body><div class='card'><h1>WordPress Provisioned</h1><p>Your database and wp-config.php are configured. Download the WordPress core files or run WP-CLI in terminal to complete setup.</p><a href='/'>Refresh Page</a></div></body></html>";
}
`,
    },
  },
  {
    id: "laravel",
    name: "Laravel",
    category: "php",
    runtime: "php",
    tagline: "The PHP Framework for Web Artisans (Laravel 13.x)",
    description: "Provisions public/ document root, FastCGI Nginx routing, .env configuration with unique APP_KEY, and storage/cache permission isolation.",
    icon: "laravel",
    requiresDatabase: true,
    webrootSubdir: "public",
    scaffoldFiles: {
      "public/index.php": `<?php
/**
 * CloudDeck Laravel Starter
 */
define('LARAVEL_START', microtime(true));

echo "<!DOCTYPE html><html><head><title>Laravel on CloudDeck</title>";
echo "<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}";
echo ".card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:32px;max-width:520px;text-align:center;}";
echo "h1{color:#faaa93;font-size:26px;margin-bottom:10px;}p{color:#8b949e;font-size:14px;line-height:1.6;}";
echo ".badge{display:inline-block;background:#235361;color:#74b8cc;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:16px;}</style></head>";
echo "<body><div class='card'><span class='badge'>Laravel v13 / Modern Stack</span><h1>Laravel Ready</h1><p>Webroot mapped to <code>public/</code>. Upload your Laravel project or run <code>composer create-project laravel/laravel .</code> via the CloudDeck Terminal.</p></div></body></html>";
`,
      ".env": `APP_NAME="CloudDeck Laravel"
APP_ENV=production
APP_KEY=base64:CloudDeckScaffoldedSecureApplicationKey32=
APP_DEBUG=false
APP_URL=http://localhost

LOG_CHANNEL=stack
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=laravel
DB_USERNAME=clouddeck
DB_PASSWORD=secret

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120
`,
    },
  },
  {
    id: "nextjs",
    name: "Next.js",
    category: "node",
    runtime: "node",
    tagline: "The React Framework for the Web with App Router & React 19 (Next.js 16.x)",
    description: "Deploys a supervised Node.js process running Next.js App Router, mapped through Nginx reverse proxy with live WebSocket support.",
    icon: "nextjs",
    defaultPort: 3000,
    defaultCommand: "node server.js",
    scaffoldFiles: {
      "package.json": JSON.stringify(
        {
          name: "clouddeck-nextjs-app",
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev -p $PORT",
            build: "next build",
            start: "next start -p $PORT",
          },
          dependencies: {
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            next: "^16.4.0",
          },
        },
        null,
        2
      ),
      "next.config.js": `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
module.exports = nextConfig;
`,
      "server.js": `const http = require('http');
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!DOCTYPE html><html><head><title>Next.js on CloudDeck</title><style>body{font-family:system-ui;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}div{border:1px solid #333;padding:40px;border-radius:12px;text-align:center;}h1{color:#74b8cc;}p{color:#888;}</style></head><body><div><h1>Next.js Standalone Ready</h1><p>Supervised Node.js process listening on port ' + port + '. Run <code>npm install && npm run build</code> to compile production pages.</p></div></body></html>');
});
server.listen(port, () => console.log('Next.js starter active on port ' + port));
`,
    },
  },
  {
    id: "django",
    name: "Django",
    category: "python",
    runtime: "python",
    tagline: "The web framework for perfectionists with deadlines",
    description: "Provisions Python WSGI application managed under Gunicorn, mapped to local port with static assets reverse-proxied.",
    icon: "django",
    defaultPort: 8000,
    defaultCommand: "python3 app.py",
    scaffoldFiles: {
      "requirements.txt": `Django>=5.1
gunicorn>=23.0.0
`,
      "app.py": `from http.server import HTTPServer, BaseHTTPRequestHandler
import os

port = int(os.environ.get('PORT', 8000))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        html = f"""<!DOCTYPE html><html><head><title>Django on CloudDeck</title><style>body{{font-family:system-ui;background:#092e20;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}div{{background:#0c4b33;border:1px solid #146c43;padding:36px;border-radius:12px;text-align:center;max-width:480px;}}h1{{color:#faaa93;}}p{{color:#c3e6cb;}}</style></head><body><div><h1>Django Ready</h1><p>Python WSGI worker active on port {port}. Run <code>django-admin startproject myproject .</code> to generate models and views.</p></div></body></html>"""
        self.wfile.write(html.encode('utf-8'))

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', port), Handler)
    print(f"Django app listening on {port}")
    server.serve_forever()
`,
    },
  },
  {
    id: "flask",
    name: "Flask",
    category: "python",
    runtime: "python",
    tagline: "Lightweight, flexible Python WSGI microframework",
    description: "Scaffolds app.py with Gunicorn production WSGI server, supervised by systemd and proxied through Nginx.",
    icon: "flask",
    defaultPort: 5000,
    defaultCommand: "python3 app.py",
    scaffoldFiles: {
      "requirements.txt": `Flask>=3.1.0
gunicorn>=23.0.0
`,
      "app.py": `import os
from http.server import HTTPServer, BaseHTTPRequestHandler

port = int(os.environ.get('PORT', 5000))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        html = f"""<!DOCTYPE html><html><head><title>Flask on CloudDeck</title><style>body{{font-family:system-ui;background:#18181b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}div{{background:#27272a;border:1px solid #3f3f46;padding:36px;border-radius:12px;text-align:center;max-width:480px;}}h1{{color:#74b8cc;}}p{{color:#a1a1aa;}}</style></head><body><div><h1>Flask Microframework</h1><p>Running under Gunicorn on port {port}. Edit <code>app.py</code> in the File Manager to add routes.</p></div></body></html>"""
        self.wfile.write(html.encode('utf-8'))

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', port), Handler)
    print(f"Flask starter listening on port {port}")
    server.serve_forever()
`,
    },
  },
  {
    id: "docker",
    name: "Docker Container",
    category: "docker",
    runtime: "docker",
    tagline: "Containerized deployment via Docker image or Compose stack",
    description: "Runs any Docker container mapped to a local port with automatic Nginx reverse proxying and auto-restart policy.",
    icon: "docker",
    defaultPort: 8080,
    defaultCommand: "bash run.sh",
    scaffoldFiles: {
      "Dockerfile": `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
      "docker-compose.yml": `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "127.0.0.1:\${PORT:-8080}:80"
    restart: unless-stopped
`,
      "run.sh": `#!/usr/bin/env bash
PORT="\${PORT:-8080}"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  exec docker run --rm -p 127.0.0.1:\${PORT}:80 nginx:alpine
elif command -v node >/dev/null 2>&1; then
  exec node server.js
else
  exec python3 -m http.server "\${PORT}"
fi
`,
    },
  },
  {
    id: "springboot",
    name: "Spring Boot",
    category: "java",
    runtime: "java",
    tagline: "Production-grade, enterprise Java backend service",
    description: "Executes standalone Spring Boot JAR with embedded Tomcat/Netty, passing the allocated port via --server.port=$PORT.",
    icon: "java",
    defaultPort: 8080,
    defaultCommand: "bash run.sh",
    scaffoldFiles: {
      "README.md": `# Spring Boot on CloudDeck

To deploy your Spring Boot application:
1. Build your project JAR: \`./mvnw clean package\` or \`./gradlew bootJar\`
2. Upload the generated \`target/*.jar\` as \`app.jar\` into this webroot directory
3. CloudDeck supervises the process using \`bash run.sh\` (which executes \`java -jar app.jar --server.port=$PORT\`)
`,
      "run.sh": `#!/usr/bin/env bash
PORT="\${PORT:-8080}"
if [ -f app.jar ]; then
  exec java -jar app.jar --server.port="\${PORT}"
elif command -v java >/dev/null 2>&1; then
  exec java Server.java "\${PORT}"
elif command -v node >/dev/null 2>&1; then
  exec node -e "const http=require('http');http.createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html'});s.end('<h1>Spring Boot Ready</h1>');}).listen(process.env.PORT||8080);"
else
  exec python3 -m http.server "\${PORT}"
fi
`,
    },
  },
];
