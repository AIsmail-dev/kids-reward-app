import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"

export default function AdminKids() {
    const [kids, setKids] = useState([])
    const [selectedKid, setSelectedKid] = useState("")
    const [title, setTitle] = useState("")
    const [amount, setAmount] = useState("")
    const [entryType, setEntryType] = useState("reward") // reward or punishment

    useEffect(() => {
        async function fetchKids() {
            const { data } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'kid')

            if (data && data.length > 0) {
                setKids(data)
                setSelectedKid(data[0].id)
            }
        }
        fetchKids()
    }, [])

    async function handleSubmit() {
        if (!selectedKid || !title || !amount) {
            alert("Please fill all fields!");
            return;
        }

        const value = parseInt(amount, 10);
        if (isNaN(value) || value <= 0) {
            alert("Please enter a valid amount greater than 0");
            return;
        }

        const actualAmount = entryType === 'punishment' ? -Math.abs(value) : Math.abs(value);

        // First, create a one-off "dummy" task to represent this exceptional entry
        // This task is active: false so it won't show up in daily loops.
        const { data: taskData, error: taskError } = await supabase
            .from('tasks')
            .insert({
                title: `[Exceptional] ${title}`,
                reward: actualAmount,
                recurrence: 'once',
                assigned_kid: selectedKid,
                active: false
            })
            .select('*')
            .single()

        if (taskError) {
            alert("Error creating exceptional task context: " + taskError.message);
            return;
        }

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

        // Add the task occurrence approved directly
        const { error: occError } = await supabase
            .from('task_occurrences')
            .insert({
                task_id: taskData.id,
                kid_id: selectedKid,
                scheduled_date: todayStr,
                status: 'approved'
            })

        if (occError) {
            alert("Error logging occurrence: " + occError.message);
            return;
        }

        // Add the direct wallet transaction
        const { error: walletError } = await supabase
            .from('wallet_transactions')
            .insert({
                kid_id: selectedKid,
                amount: actualAmount,
                type: entryType === 'reward' ? 'reward' : 'withdraw' // Withdraw takes from balance
            });

        if (walletError) {
            alert("Error adjusting wallet: " + walletError.message);
        } else {
            alert(`Successfully added ${entryType.charAt(0).toUpperCase() + entryType.slice(1)}! ✅`);
            setTitle("");
            setAmount("");
        }
    }

    return (
        <div style={{ padding: '20px' }}>
            <h1 style={{ marginBottom: '20px' }}>Kids Management 👶</h1>
            <p>Add an exceptional reward or punishment instantly to a kid's wallet, with task tracking context.</p>

            <div className="card" style={{ maxWidth: '600px', marginTop: '20px' }}>
                <h2 style={{ marginTop: 0 }}>Exceptional Entry</h2>

                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Select Kid</label>
                <select
                    className="user-select"
                    style={{ width: '100%', marginBottom: '15px' }}
                    value={selectedKid}
                    onChange={e => setSelectedKid(e.target.value)}
                >
                    {kids.map(k => (
                        <option key={k.id} value={k.id}>
                            {k.name}
                        </option>
                    ))}
                </select>

                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Action Type</label>
                <select
                    className="user-select"
                    style={{ width: '100%', marginBottom: '15px' }}
                    value={entryType}
                    onChange={e => setEntryType(e.target.value)}
                >
                    <option value="reward">Extrinsic Reward (+)</option>
                    <option value="punishment">Punishment Deduction (-)</option>
                </select>

                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Reason</label>
                <input
                    className="user-select"
                    style={{ width: '100%', marginBottom: '15px' }}
                    placeholder="E.g. Helping sister with homework"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                />

                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Amount (ر.س)</label>
                <input
                    className="user-select"
                    style={{ width: '100%', marginBottom: '20px' }}
                    type="number"
                    placeholder="E.g. 5"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                />

                <button
                    className="button"
                    onClick={handleSubmit}
                    style={{ width: '100%', background: entryType === 'punishment' ? '#ef4444' : 'var(--primary)', color: 'white' }}
                >
                    {entryType === 'reward' ? 'Add Reward' : 'Deduct Punishment'}
                </button>
            </div>
        </div>
    )
}
