import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"
import { useNavigate } from "react-router-dom"
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function Login() {
    const [name, setName] = useState("")
    const [pin, setPin] = useState("")
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(false)

    const nav = useNavigate()

    useEffect(() => {
        if (pin.length === 4) {
            attemptLogin()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pin])

    async function attemptLogin() {
        if (!name) {
            alert("Please select a user first!")
            setPin("")
            return
        }

        const { data } = await supabase
            .from('users')
            .select('*')
            .eq('name', name)
            .eq('pin', pin)
            .single()

        if (!data) {
            setError(true)
            setTimeout(() => {
                setPin("")
                setError(false)
            }, 500)
            return
        }

        if (data.role === 'parent') {
            handlePasskeyLogin(data)
        } else {
            localStorage.setItem("user", JSON.stringify(data))
            nav('/kid')
        }
    }

    async function handlePasskeyLogin(user) {
        setLoading(true);
        // rpID must be the same on the backend and frontend
        const rpID = window.location.hostname;
        const origin = window.location.origin;

        try {
            // Fetch latest user data directly to check passkeys accurately
            const { data: latestUser } = await supabase.from('users').select('passkeys').eq('id', user.id).single();
            const hasPasskey = latestUser?.passkeys && latestUser.passkeys.length > 0;

            if (!hasPasskey) {
                // --- REGISTRATION FLOW ---
                const respConfig = await fetch('/api/webauthn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'generate-registration', userId: user.id, rpID })
                });

                if (!respConfig.ok) throw new Error("Could not start registration");
                const options = await respConfig.json();

                let cred;
                try {
                    cred = await startRegistration(options);
                } catch (err) {
                    console.error("Registration cancelled or failed:", err);
                    setPin('');
                    setLoading(false);
                    return;
                }

                const respVerify = await fetch('/api/webauthn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'verify-registration', userId: user.id, rpID, origin, credential: cred })
                });

                const verifyRes = await respVerify.json();
                if (verifyRes.verified) {
                    localStorage.setItem("user", JSON.stringify(user));
                    nav('/parent');
                } else {
                    alert("Passkey registration failed.");
                    setPin('');
                }
            } else {
                // --- AUTHENTICATION FLOW ---
                const respConfig = await fetch('/api/webauthn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'generate-authentication', userId: user.id, rpID })
                });

                if (!respConfig.ok) throw new Error("Could not start authentication");
                const options = await respConfig.json();

                let cred;
                try {
                    cred = await startAuthentication(options);
                } catch (err) {
                    console.error("Authentication cancelled or failed:", err);
                    setPin('');
                    setLoading(false);
                    return;
                }

                const respVerify = await fetch('/api/webauthn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'verify-authentication', userId: user.id, rpID, origin, credential: cred })
                });

                const verifyRes = await respVerify.json();
                if (verifyRes.verified) {
                    localStorage.setItem("user", JSON.stringify(user));
                    nav('/parent');
                } else {
                    alert("Passkey verification failed.");
                    setPin('');
                }
            }
        } catch (e) {
            console.error("Passkey error:", e);
            alert("Security error: " + e.message);
            setPin('');
        }
        setLoading(false);
    }

    const handleKeyPress = (num) => {
        if (pin.length < 4) {
            setPin(prev => prev + num)
        }
    }

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1))
    }

    return (
        <div className="login-container">
            <h1 className="title">Welcome Back! ✨</h1>

            <select
                className="user-select"
                value={name}
                onChange={e => {
                    setName(e.target.value)
                    setPin("")
                    setError(false)
                }}
                disabled={loading}
            >
                <option value="" disabled>Who are you?</option>
                <option>Farida</option>
                <option>Yahia</option>
                <option>Ahmed</option>
            </select>

            {name && (
                <>
                    <h2 style={{ color: '#2B2D42', fontSize: '1.2rem', marginBottom: '10px' }}>Enter your secret PIN</h2>

                    {loading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#555' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🧬</div>
                            <p style={{ fontWeight: 'bold' }}>Waiting for Biometrics...</p>
                            <p style={{ fontSize: '0.9rem' }}>Please verify FaceID/TouchID on your device.</p>
                        </div>
                    ) : (
                        <>
                            <div className="pin-dots" style={error ? { transform: 'translateX(-5px) translateX(5px)', transition: '0.1s' } : {}}>
                                {[0, 1, 2, 3].map(i => (
                                    <div
                                        key={i}
                                        className={`pin-dot ${pin.length > i ? 'filled' : ''}`}
                                        style={error ? { background: 'var(--primary)' } : {}}
                                    ></div>
                                ))}
                            </div>

                            <div className="numpad">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                    <button
                                        key={num}
                                        className="num-key"
                                        onClick={() => handleKeyPress(num.toString())}
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button className="num-key" onClick={handleDelete} style={{ background: '#FFF0F0', color: 'var(--primary)', fontSize: '1.5rem' }}>⌫</button>
                                <button className="num-key" onClick={() => handleKeyPress("0")}>0</button>
                                <div className="num-key" style={{ visibility: 'hidden' }}></div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
