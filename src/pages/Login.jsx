import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"
import { useNavigate } from "react-router-dom"

export default function Login() {
    const [name, setName] = useState("")
    const [pin, setPin] = useState("")
    const [error, setError] = useState(false)

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

        // Successfully authenticated
        localStorage.setItem("user", JSON.stringify(data))

        if (data.role === 'parent') {
            nav('/parent')
        } else {
            nav('/kid')
        }
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
        </div>
    )
}
