import * as OTPAuth from 'otpauth';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, secret, token, userEmail } = req.body;

    if (action === 'generate') {
        const newSecret = new OTPAuth.Secret({ size: 20 });
        let totp = new OTPAuth.TOTP({
            issuer: 'KidsApp',
            label: userEmail || 'Parent',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: newSecret
        });

        const otpauth = totp.toString();
        return res.status(200).json({ secret: newSecret.base32, otpauth });
    }

    if (action === 'verify') {
        try {
            let totp = new OTPAuth.TOTP({
                issuer: 'KidsApp',
                label: userEmail || 'Parent',
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromBase32(secret)
            });

            let delta = totp.validate({ token, window: 1 });
            const isValid = (delta !== null);

            return res.status(200).json({ isValid });
        } catch (err) {
            console.error(err);
            return res.status(200).json({ isValid: false });
        }
    }

    return res.status(400).json({ error: 'Invalid action' });
}
