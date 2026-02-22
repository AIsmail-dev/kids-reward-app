import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"
import { useNavigate } from "react-router-dom"
import { QRCodeSVG } from 'qrcode.react'
import * as OTPAuth from 'otpauth'

export default function Login() {
    const [name, setName] = useState("")
    const [pin, setPin] = useState("")
    const [error, setError] = useState(false)

    // MFA States
    const [mfaStep, setMfaStep] = useState(false)
    const [mfaSetup, setMfaSetup] = useState(false)
    const [mfaCode, setMfaCode] = useState("")
    const [mfaSecret, setMfaSecret] = useState("")
    const [mfaQrUri, setMfaQrUri] = useState("")
    const [parentData, setParentData] = useState(null)

    const nav = useNavigate()

    useEffect(() => {
        if (!mfaStep && pin.length === 4) {
            attemptLogin()
        }
    }, [pin, mfaStep])

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
            setParentData(data)
            setMfaStep(true)

            // Check if they already have MFA configured
            if (!data.totp_secret) {
                setMfaSetup(true)

                const newSecret = new OTPAuth.Secret({ size: 20 });
                const totp = new OTPAuth.TOTP({
                    issuer: 'KidsApp',
                    label: data.name || 'Parent',
                    algorithm: 'SHA1',
                    digits: 6,
                    period: 30,
                    secret: newSecret
                });

                setMfaSecret(newSecret.base32)
                setMfaQrUri(totp.toString())
            }
        } else {
            localStorage.setItem("user", JSON.stringify(data))
            nav('/kid')
        }
    }

    async function verifyMFA() {
        if (mfaCode.length !== 6) {
            setError(true)
            setTimeout(() => setError(false), 500)
            return
        }

        const secretToCheck = mfaSetup ? mfaSecret : parentData.totp_secret;

        let isValid = false;
        try {
            const totp = new OTPAuth.TOTP({
                issuer: 'KidsApp',
                label: parentData.name || 'Parent',
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromBase32(secretToCheck)
            });

            const delta = totp.validate({ token: mfaCode, window: 1 });
            isValid = (delta !== null);
        } catch (e) {
            console.error("MFA Validation Error", e)
        }

        if (isValid) {
            if (mfaSetup) {
                // Save the newly generated secret back to supabase
                await supabase.from('users').update({ totp_secret: mfaSecret }).eq('id', parentData.id);
                parentData.totp_secret = mfaSecret;
            }

            localStorage.setItem("user", JSON.stringify(parentData))
            nav('/parent')
        } else {
            alert("Invalid MFA Code. Please try again.")
            setMfaCode("")
            setError(true)
            setTimeout(() => setError(false), 500)
        }
    }

    const handleKeyPress = (num) => {
        if (!mfaStep && pin.length < 4) {
            setPin(prev => prev + num)
        }
    }

    const handleDelete = () => {
        if (!mfaStep) setPin(prev => prev.slice(0, -1))
    }

    return (
        <div className="login-container">
            {!mfaStep ? (
                <>
                    <h1 className="title">Welcome Back! ✨</h1>

                    <select
                        className="user-select"
                        value={name}
                        onChange={e => {
                            setName(e.target.value)
                            setPin("")
                            setError(false)
                        }}
                    >
                        <option value="" disabled>Who are you?</option>
                        <option>Farida</option>
                        <option>Yahia</option>
                        <option>Ahmed</option>
                    </select>

                    {name && (
                        <>
                            <h2 style={{ color: '#2B2D42', fontSize: '1.2rem', marginBottom: '10px' }}>Enter your secret PIN</h2>
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
            ) : (
                <div style={{ textAlign: 'center', width: '100%', maxWidth: '300px' }}>
                    <h1 className="title">Security 🔒</h1>

                    {mfaSetup ? (
                        <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                            <p style={{ margin: '0 0 15px', fontSize: '14px', color: '#555' }}>Scan this QR code using Google Authenticator or an equivalent MFA app to secure your account.</p>
                            {mfaQrUri && <QRCodeSVG value={mfaQrUri} size={150} />}
                        </div>
                    ) : (
                        <p style={{ margin: '0 0 15px', fontSize: '16px', color: '#2B2D42' }}>Enter your 6-digit Authenticator Code to proceed.</p>
                    )}

                    <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        value={mfaCode}
                        onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        style={{
                            width: '100%', padding: '15px', fontSize: '24px',
                            letterSpacing: '5px', textAlign: 'center', borderRadius: '12px',
                            border: error ? '2px solid red' : '1px solid #ddd', outline: 'none',
                            marginBottom: '20px', '-webkit-appearance': 'none'
                        }}
                    />

                    <button className="button" onClick={verifyMFA}>
                        {mfaSetup ? "Verify & Save 2FA" : "Login Now"}
                    </button>

                    <button
                        className="button button-secondary"
                        style={{ marginTop: '10px' }}
                        onClick={() => {
                            setMfaStep(false);
                            setMfaSetup(false);
                            setPin('');
                            setMfaCode('');
                            setName('');
                        }}
                    >
                        Reset / Go Back
                    </button>
                </div>
            )}
        </div>
    )
}
