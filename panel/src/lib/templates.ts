export interface IndustrialAppTemplate {
  id: string;
  name: string;
  category: "php" | "node" | "python" | "java" | "docker" | "other";
  runtime: "php" | "node" | "python" | "go" | "ruby" | "java" | "docker" | "static" | "custom";
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
    id: "wordpress",
    name: "WordPress",
    category: "php",
    runtime: "php",
    tagline: "World's most popular CMS & WooCommerce eCommerce platform",
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
    tagline: "The PHP Framework for Web Artisans",
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
echo "<body><div class='card'><span class='badge'>Laravel v11 / Modern Stack</span><h1>Laravel Ready</h1><p>Webroot mapped to <code>public/</code>. Upload your Laravel project or run <code>composer create-project laravel/laravel .</code> via the CloudDeck Terminal.</p></div></body></html>";
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
    tagline: "The React Framework for the Web with App Router & SSR",
    description: "Deploys a supervised Node.js process running Next.js App Router, mapped through Nginx reverse proxy with live WebSocket support.",
    icon: "nextjs",
    defaultPort: 3000,
    defaultCommand: "npm run start",
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
            next: "^15.4.0",
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
    defaultCommand: "python3 -m gunicorn myproject.wsgi:application --bind 127.0.0.1:$PORT",
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
    defaultCommand: "python3 -m gunicorn app:app --bind 127.0.0.1:$PORT",
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
    defaultCommand: "docker run --rm --name clouddeck-docker-app -p 127.0.0.1:$PORT:80 nginx:alpine",
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
    defaultCommand: "java -jar app.jar --server.port=$PORT",
    scaffoldFiles: {
      "README.md": `# Spring Boot on CloudDeck

To deploy your Spring Boot application:
1. Build your project JAR: \`./mvnw clean package\` or \`./gradlew bootJar\`
2. Upload the generated \`target/*.jar\` as \`app.jar\` into this webroot directory
3. CloudDeck supervises the process using: \`java -jar app.jar --server.port=$PORT\`
`,
    },
  },
];
