// Prints a fresh .env.docker for the Docker production stack (see deploy.sh): database password,
// JWT secret, and the anon / service_role API keys signed with it (same shape as Supabase's).
import { createHmac, randomBytes } from 'node:crypto';

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sign = (payload, secret) => {
    const body = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}`;
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};

const secret = randomBytes(36).toString('base64url');
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600;

console.log(`POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}
SUPABASE_JWT_SECRET=${secret}
SUPABASE_ANON_KEY=${sign({ iss: 'supabase', role: 'anon', iat, exp }, secret)}
SUPABASE_SERVICE_ROLE_KEY=${sign({ iss: 'supabase', role: 'service_role', iat, exp }, secret)}`);
