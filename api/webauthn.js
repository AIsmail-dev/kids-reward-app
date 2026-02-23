import { createClient } from '@supabase/supabase-js';

// Helper to convert Uint8Array to Base64 String
function bufferToBase64(buf) {
    const binString = Array.from(buf, (x) => String.fromCharCode(x)).join("");
    return btoa(binString);
}

// Helper to convert Base64 String to Uint8Array
function base64ToBuffer(b64) {
    const binString = atob(b64);
    return Uint8Array.from(binString, (m) => m.charCodeAt(0));
}

export default async function handler(req, res) {
    console.log("WebAuthn Handler Invoked:", req.body?.action);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const SUPA_URL = process.env.VITE_SUPABASE_URL || "https://tvsznlwyvamovdxlpzuc.supabase.co";
        const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_CjnlgIJwWu1s1GpAU-7e6Q_zckxdHiV";
        const supabase = createClient(SUPA_URL, SUPA_KEY);

        const { action, userId, userName, rpID, origin, credential } = req.body;

        let query = supabase.from('users').select('*');
        if (userId) query = query.eq('id', userId);
        else if (userName) query = query.eq('name', userName);
        else return res.status(400).json({ error: 'Missing userId or userName' });

        const { data: user } = await query.single();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const passkeys = user.passkeys || [];

        const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = await import('@simplewebauthn/server');

        if (action === 'generate-registration') {
            const options = await generateRegistrationOptions({
                rpName: 'Kids Rewards App',
                rpID,
                userID: new TextEncoder().encode(user.id),
                userName: user.name,
                attestationType: 'none',
                excludeCredentials: passkeys.map(key => ({
                    id: key.id,
                    transports: key.transports,
                })),
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                },
            });
            await supabase.from('users').update({ current_challenge: options.challenge }).eq('id', user.id);
            return res.status(200).json(options);
        }

        if (action === 'verify-registration') {
            const verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge: user.current_challenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
            });

            if (verification.verified && verification.registrationInfo) {
                const newCred = verification.registrationInfo.credential;

                const newPasskey = {
                    id: newCred.id,
                    publicKey: bufferToBase64(newCred.publicKey),
                    counter: newCred.counter,
                    transports: newCred.transports || [],
                };
                passkeys.push(newPasskey);

                await supabase.from('users').update({
                    passkeys,
                    current_challenge: null
                }).eq('id', user.id);

                return res.status(200).json({ verified: true });
            }
            return res.status(400).json({ verified: false, error: 'Registration verification failed' });
        }

        if (action === 'generate-authentication') {
            const options = await generateAuthenticationOptions({
                rpID,
                userVerification: 'preferred',
                allowCredentials: passkeys.map(key => ({
                    id: key.id,
                    transports: key.transports,
                })),
            });
            await supabase.from('users').update({ current_challenge: options.challenge }).eq('id', user.id);
            return res.status(200).json(options);
        }

        if (action === 'verify-authentication') {
            const passkey = passkeys.find(k => k.id === credential.id);
            if (!passkey) {
                return res.status(400).json({ verified: false, error: 'Authenticator is not registered with this site' });
            }

            const verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge: user.current_challenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                credential: {
                    id: passkey.id,
                    publicKey: base64ToBuffer(passkey.publicKey),
                    counter: passkey.counter,
                    transports: passkey.transports,
                }
            });

            if (verification.verified) {
                passkey.counter = verification.authenticationInfo.newCounter;
                await supabase.from('users').update({
                    passkeys,
                    current_challenge: null
                }).eq('id', user.id);

                return res.status(200).json({ verified: true, user });
            }
            return res.status(400).json({ verified: false });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
        console.error("WebAuthn Error:", err.message, err.stack);
        return res.status(500).json({ error: err.message });
    }
}
