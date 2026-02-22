import { authenticator } from 'otplib';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, secret, token, userEmail } = req.body;

    if (action === 'generate') {
        const newSecret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(userEmail || 'Parent', 'KidsApp', newSecret);
        return res.status(200).json({ secret: newSecret, otpauth });
    }

    if (action === 'verify') {
        try {
            const isValid = authenticator.verify({ token, secret });
            return res.status(200).json({ isValid });
        } catch (err) {
            return res.status(200).json({ isValid: false });
        }
    }

    return res.status(400).json({ error: 'Invalid action' });
}
