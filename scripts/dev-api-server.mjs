import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
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

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
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
