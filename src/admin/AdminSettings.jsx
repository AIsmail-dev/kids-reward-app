import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"

export default function AdminSettings() {
    const [rates, setRates] = useState([])
    const [destinations, setDestinations] = useState([])
    const [newDestName, setNewDestName] = useState("")

    useEffect(() => {
        fetchRates()
        fetchDestinations()
    }, [])

    async function fetchRates() {
        const { data } = await supabase.from('wallet_rates').select('*').order('wallet')
        setRates(data || [])
    }

    async function fetchDestinations() {
        const { data } = await supabase.from('money_destinations').select('*').order('created_at')
        setDestinations(data || [])
    }

    async function updateRate(wallet, field, value) {
        const patch = field === 'points_per_unit' ? { points_per_unit: parseFloat(value) } : { unit_label: value }
        if (field === 'points_per_unit' && (isNaN(patch.points_per_unit) || patch.points_per_unit <= 0)) return
        await supabase.from('wallet_rates').update(patch).eq('wallet', wallet)
        fetchRates()
    }

    async function addDestination() {
        if (!newDestName.trim()) return
        const { error } = await supabase.from('money_destinations').insert({ name: newDestName.trim() })
        if (error) alert("Error adding destination: " + error.message)
        else {
            setNewDestName("")
            fetchDestinations()
        }
    }

    async function toggleDestination(d) {
        await supabase.from('money_destinations').update({ active: !d.active }).eq('id', d.id)
        fetchDestinations()
    }

    async function deleteDestination(d) {
        if (!confirm(`Delete "${d.name}"?`)) return
        const { error } = await supabase.from('money_destinations').delete().eq('id', d.id)
        if (error) alert("Error deleting: " + error.message)
        else fetchDestinations()
    }

    const walletName = (w) => w === 'money' ? '💰 Money' : '⏰ Screen Time'

    return (
        <div>
            <div className="admin-header">
                <h1>Settings</h1>
            </div>

            <div className="admin-card">
                <h2 style={{ marginTop: 0 }}>Wallet Conversion Rates ⭐</h2>
                <p style={{ color: '#666' }}>How many points a kid must spend to get 1 unit of Money or Screen Time.</p>

                {rates.map(r => (
                    <div key={r.wallet} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
                        <strong style={{ width: '140px' }}>{walletName(r.wallet)}</strong>
                        <input
                            type="number"
                            defaultValue={r.points_per_unit}
                            style={{ width: '80px' }}
                            onBlur={e => updateRate(r.wallet, 'points_per_unit', e.target.value)}
                        />
                        <span>points = 1</span>
                        <input
                            className="user-select"
                            defaultValue={r.unit_label}
                            style={{ width: '120px' }}
                            onBlur={e => updateRate(r.wallet, 'unit_label', e.target.value)}
                        />
                    </div>
                ))}
            </div>

            <div className="admin-card" style={{ marginTop: '20px' }}>
                <h2 style={{ marginTop: 0 }}>Money Payout Destinations 💵</h2>
                <p style={{ color: '#666' }}>Where a kid can ask to have their Money wallet paid out to.</p>

                <table style={{ width: '100%', marginTop: '15px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '8px' }}>Name</th>
                            <th style={{ textAlign: 'left', padding: '8px' }}>Active</th>
                            <th style={{ padding: '8px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {destinations.map(d => (
                            <tr key={d.id} style={{ borderTop: '1px solid #eee' }}>
                                <td style={{ padding: '8px' }}>{d.name}</td>
                                <td style={{ padding: '8px' }}>
                                    <button className="button button-secondary" onClick={() => toggleDestination(d)}>
                                        {d.active ? 'Active' : 'Inactive'}
                                    </button>
                                </td>
                                <td style={{ padding: '8px' }}>
                                    <button className="button" style={{ background: '#ef4444', color: 'white' }} onClick={() => deleteDestination(d)}>
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <input
                        className="user-select"
                        placeholder="e.g. School Canteen Wallet"
                        value={newDestName}
                        onChange={e => setNewDestName(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <button className="button" onClick={addDestination}>Add</button>
                </div>
            </div>
        </div>
    )
}
