import React, { useState, useEffect } from "react"
import { callPlayStation } from "../playStation"

export default function PlayStationSettings({ notify }) {
    const [status, setStatus] = useState(null)
    const [npsso, setNpsso] = useState("")
    const [connecting, setConnecting] = useState(false)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    useEffect(() => {
        fetchStatus()
    }, [])

    async function fetchStatus() {
        try {
            setStatus(await callPlayStation('status'))
        } catch (e) {
            notify(e.message, 'error')
        }
    }

    async function connect() {
        // Accept the whole {"npsso":"..."} page as well as the code alone.
        const code = (npsso.match(/[A-Za-z0-9]{64}/) || [npsso.trim()])[0]
        setConnecting(true)
        try {
            const next = await callPlayStation('connect', { npsso: code })
            setStatus(next)
            setNpsso("")
            if (!next.error) notify("PlayStation connected ✅")
        } catch (e) {
            notify(e.message, 'error')
        }
        setConnecting(false)
    }

    async function disconnect() {
        try {
            await callPlayStation('disconnect')
        } catch (e) {
            notify(e.message, 'error')
        }
        setConfirmDisconnect(false)
        fetchStatus()
    }

    async function linkKid(kidId, child) {
        try {
            const result = await callPlayStation('link', child
                ? { kidId, memberId: child.memberId, accountId: child.accountId, name: child.name }
                : { kidId })
            if (result.warning) notify(result.warning, 'error')
            fetchStatus()
        } catch (e) {
            notify(e.message, 'error')
        }
    }

    const working = status?.connected && !status.error

    return (
        <>
            <h2 className="section-title">PlayStation 🎮</h2>
            <div className="card">
                <p className="muted">
                    Approved PlayStation time is added to the kid's play-time limit for today. When it runs out,
                    the PlayStation signs them out.
                </p>

                {status?.error && <div className="status-line error">{status.error}</div>}
                {working && <div className="status-line ok">Connected ✅</div>}

                {status && !working && (
                    <>
                        <ol className="muted" style={{ paddingLeft: '20px', margin: 0 }}>
                            <li>Sign in at playstation.com as the Family Manager (the parent account).</li>
                            <li>In the same browser, open ca.account.sony.com/api/v1/ssocookie.</li>
                            <li>Copy the 64-character npsso code (or the whole page) and paste it below.</li>
                        </ol>
                        <input className="input" placeholder="Paste the npsso code here" autoComplete="off"
                            value={npsso} onChange={e => setNpsso(e.target.value)} />
                        <button className="button button-info button-small" disabled={connecting || !npsso.trim()} onClick={connect}>
                            {connecting ? 'Connecting…' : 'Connect'}
                        </button>
                    </>
                )}

                {working && status.children.length === 0 && (
                    <p className="muted">No child accounts found in your PlayStation family.</p>
                )}

                {working && status.children.length > 0 && status.kids.map(kid => {
                    const link = status.links.find(l => l.kid_id === kid.id)
                    return (
                        <div key={kid.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <strong>{kid.name}'s PlayStation account</strong>
                            <div className="chips">
                                {status.children.map(c => {
                                    const selected = link?.psn_member_id === c.memberId
                                    return (
                                        <button key={c.memberId} className={`chip ${selected ? 'selected' : ''}`}
                                            onClick={() => selected ? linkKid(kid.id) : linkKid(kid.id, c)}>
                                            {selected ? '✓ ' : ''}{c.name}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}

                {status?.connected && (confirmDisconnect ? (
                    <div className="row">
                        <span className="muted">Disconnect? Time must then be added by hand.</span>
                        <button className="button button-small" onClick={disconnect}>Disconnect</button>
                        <button className="button button-ghost button-small" onClick={() => setConfirmDisconnect(false)}>Keep</button>
                    </div>
                ) : (
                    <button className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmDisconnect(true)}>
                        Disconnect PlayStation
                    </button>
                ))}
            </div>
        </>
    )
}
