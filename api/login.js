import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { name, pin } = req.body || {};
    if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' });

    const SUPA_URL = process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!SUPA_URL || !SERVICE_KEY || !JWT_SECRET) {
        console.error('api/login: missing required env vars (SUPABASE URL / SERVICE ROLE KEY / JWT SECRET)');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const admin = createClient(SUPA_URL, SERVICE_KEY);

    const { data: user, error } = await admin
        .from('users')
        .select('id, name, role, pin')
        .eq('name', name)
        .single();

    if (error) {
        console.error('api/login: Supabase query failed:', JSON.stringify(error));
    } else if (!user) {
        console.error('api/login: query succeeded but returned no user for name:', name);
    } else if (user.pin !== pin) {
        console.error('api/login: user found but PIN did not match for name:', name);
    }

    if (error || !user || user.pin !== pin) {
        return res.status(401).json({ error: 'Invalid name or PIN' });
    }

    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
        {
            sub: user.id,
            role: 'authenticated',
            aud: 'authenticated',
            app_role: user.role,
            name: user.name,
            iat: now,
            exp: now + 60 * 60 * 24 * 30,
        },
        JWT_SECRET,
        { algorithm: 'HS256' }
    );

    return res.status(200).json({
        token,
        user: { id: user.id, name: user.name, role: user.role },
    });
}
