import React, { useState, useEffect } from "react"
import { callFamilyLink } from "../familyLink"

export default function FamilyLinkSettings({ notify }) {
    const [status, setStatus] = useState(null)
    const [cookieText, setCookieText] = useState("")
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    useEffect(() => {
        fetchStatus()
    }, [])

    async function fetchStatus() {
        try {
            setStatus(await callFamilyLink('status'))
        } catch (e) {
            notify(e.message, 'error')
        }
    }

    async function connect() {
        let cookies
        try {
            cookies = JSON.parse(cookieText)
        } catch {
            notify("That isn't valid JSON. Paste the whole Cookie-Editor export.", 'error')
            return
        }
        try {
            const next = await callFamilyLink('connect', { cookies })
            setStatus(next)
            setCookieText("")
            if (!next.error) notify("Family Link connected ✅")
        } catch (e) {
            notify(e.message, 'error')
        }
    }

    async function disconnect() {
        await callFamilyLink('disconnect')
        setConfirmDisconnect(false)
        fetchStatus()
    }

    async function linkKid(kidId, childId, deviceId) {
        try {
            await callFamilyLink('link', { kidId, childId, deviceId })
            fetchStatus()
        } catch (e) {
            notify(e.message, 'error')
        }
    }

    // One choice per Google device, so it sets both the child and the device.
    const devices = (status?.children || []).flatMap(c =>
        c.devices.map(d => ({ childId: c.id, deviceId: d.id, label: `${c.name.split(' ')[0]} · ${d.name}` }))
    )
    const working = status?.connected && !status.error

    return (
        <>
            <h2 className="section-title">Google Family Link 📱</h2>
            <div className="card">
                <p className="muted">Approved screen time is added to the kid's phone automatically.</p>

                {status?.error && <div className="status-line error">{status.error}</div>}
                {working && <div className="status-line ok">Connected ✅</div>}

                {status && !working && (
                    <>
                        <ol className="muted" style={{ paddingLeft: '20px', margin: 0 }}>
                            <li>In Chrome, open an Incognito window and sign in at familylink.google.com as the parent.</li>
                            <li>Open Cookie-Editor, then Export → JSON.</li>
                            <li>Paste it below, press Connect, then close the Incognito window without signing out.</li>
                        </ol>
                        <textarea className="input" rows={3} placeholder="Paste cookies here"
                            value={cookieText} onChange={e => setCookieText(e.target.value)} />
                        <button className="button button-info button-small" onClick={connect}>Connect</button>
                    </>
                )}

                {working && status.kids.map(kid => {
                    const link = status.links.find(l => l.kid_id === kid.id)
                    return (
                        <div key={kid.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <strong>{kid.name}'s phone</strong>
                            <div className="chips">
                                {devices.map(d => {
                                    const selected = link?.google_child_id === d.childId && link?.google_device_id === d.deviceId
                                    return (
                                        <button key={d.deviceId} className={`chip ${selected ? 'selected' : ''}`}
                                            onClick={() => selected ? linkKid(kid.id) : linkKid(kid.id, d.childId, d.deviceId)}>
                                            {selected ? '✓ ' : ''}{d.label}
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
                        Disconnect Family Link
                    </button>
                ))}
            </div>
        </>
    )
}
