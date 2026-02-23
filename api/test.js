export default async function handler(req, res) {
    try {
        const WebAuthnServer = await import('@simplewebauthn/server');
        return res.status(200).json({ success: true, keys: Object.keys(WebAuthnServer) });
    } catch (e) {
        return res.status(200).json({ success: false, error: e.message, stack: e.stack });
    }
}
