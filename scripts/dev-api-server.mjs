import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..', 'api');
const PORT = process.env.DEV_API_PORT || 3001;

const handlers = {};
for (const file of await readdir(apiDir)) {
    if (!file.endsWith('.js')) continue;
    const name = file.slice(0, -3);
    const mod = await import(pathToFileURL(path.join(apiDir, file)).href);
    handlers[name] = mod.default;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => {
            if (!data) return resolve(undefined);
            try {
                resolve(JSON.parse(data));
            } catch {
                resolve(undefined);
            }
        });
        req.on('error', reject);
    });
}

// STATIC_DIR (set by the Docker image, see Dockerfile) also serves the built
// frontend from this process, with the same SPA fallback as vercel.json.
const STATIC_DIR = process.env.STATIC_DIR && path.resolve(process.env.STATIC_DIR);
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain',
    '.apk': 'application/vnd.android.package-archive',
};

async function serveStatic(pathname, res) {
    let file = path.join(STATIC_DIR, decodeURIComponent(pathname));
    if (!file.startsWith(STATIC_DIR)) file = STATIC_DIR;
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
        file = path.join(STATIC_DIR, 'index.html');
        info = await stat(file);
    }
    const ext = path.extname(file);
    res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': info.size,
        // Vite fingerprints everything under /assets; anything else must revalidate.
        'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(res);
}

// REST_UPSTREAM (Docker production): forward Supabase's /rest/v1/* to the PostgREST container,
// so the browser and api/*.js reach the database through this one port.
const REST_UPSTREAM = process.env.REST_UPSTREAM && new URL(process.env.REST_UPSTREAM);

function proxyRest(req, res, url) {
    const upstream = request({
        host: REST_UPSTREAM.hostname,
        port: REST_UPSTREAM.port,
        method: req.method,
        path: url.pathname.slice('/rest/v1'.length) + url.search,
        headers: { ...req.headers, host: REST_UPSTREAM.host },
    }, (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
    });
    upstream.on('error', (err) => {
        console.error('[rest-proxy]', err.message);
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database API unavailable' }));
    });
    req.pipe(upstream);
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (REST_UPSTREAM && url.pathname.startsWith('/rest/v1/')) return proxyRest(req, res, url);
    if (STATIC_DIR && !url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
    const name = url.pathname.replace(/^\/api\//, '');
    const handler = handlers[name];

    if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `No dev handler for /api/${name}` }));
        return;
    }

    req.body = await readBody(req);
    req.query = Object.fromEntries(url.searchParams);

    const shimRes = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
        },
    };

    try {
        await handler(req, shimRes);
    } catch (err) {
        console.error(`[dev-api] /api/${name} threw:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
});

server.listen(PORT, () => {
    console.log(`[dev-api] serving api/*.js on http://localhost:${PORT} (routes: ${Object.keys(handlers).join(', ')})`);
});
