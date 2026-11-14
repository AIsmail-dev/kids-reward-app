import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

const COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFB300', '#9C27B0', '#14B8A6']

export default function Login() {
    const [people, setPeople] = useState(null)
    const [loadError, setLoadError] = useState(false)
    const [name, setName] = useState("")
    const [pin, setPin] = useState("")
    const [wrong, setWrong] = useState(false)

    const nav = useNavigate()

    useEffect(() => {
        fetch('/api/login')
            .then(res => res.ok ? res.json() : Promise.reject())
            // Kids first, then parents
            .then(list => setPeople([...list].sort((a, b) => (a.role === 'parent') - (b.role === 'parent'))))
            .catch(() => setLoadError(true))
    }, [])

    useEffect(() => {
        if (pin.length === 4) attemptLogin()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pin])

    async function attemptLogin() {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, pin }),
        })

        if (!res.ok) {
            setWrong(true)
            setTimeout(() => {
                setPin("")
                setWrong(false)
            }, 700)
            return
        }

        const { token, user } = await res.json()
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(user))
        nav(user.role === 'parent' ? '/parent' : '/kid', { replace: true })
    }

    const press = (digit) => setPin(prev => prev.length < 4 ? prev + digit : prev)

    if (!name) {
        return (
            <div className="login-container">
                <h1 className="title">Who are you? 👋</h1>
                {loadError && <p className="muted">Can't reach the app. Check the internet and try again.</p>}
                <div className="name-grid">
                    {(people || []).map((p, i) => (
                        <button key={p.name} className="name-card" onClick={() => setName(p.name)}>
                            <span className="avatar" style={{ background: COLORS[i % COLORS.length] }}>
                                {p.name[0]}
                            </span>
                            {p.name}
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="login-container">
            <h1 className="title">Hi {name}! 👋</h1>
            <h2 style={{ color: wrong ? 'var(--primary)' : '#2B2D42', fontSize: '1.2rem', marginBottom: '10px' }}>
                {wrong ? 'Wrong PIN, try again' : 'Enter your PIN'}
            </h2>

            <div className="pin-dots">
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className={`pin-dot ${pin.length > i ? 'filled' : ''}`}
                        style={wrong ? { background: 'var(--primary)' } : {}}
                    ></div>
                ))}
            </div>

            <div className="numpad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button key={num} className="num-key" onClick={() => press(num.toString())}>
                        {num}
                    </button>
                ))}
                <button className="num-key" onClick={() => setPin(prev => prev.slice(0, -1))} style={{ background: '#FFF0F0', color: 'var(--primary)', fontSize: '1.5rem' }}>⌫</button>
                <button className="num-key" onClick={() => press("0")}>0</button>
                <div className="num-key" style={{ visibility: 'hidden' }}></div>
            </div>

            <button className="link-button" style={{ marginTop: '30px' }} onClick={() => { setName(""); setPin("") }}>
                ← Not {name}?
            </button>
        </div>
    )
}
