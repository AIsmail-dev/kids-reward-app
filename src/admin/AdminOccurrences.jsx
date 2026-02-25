import React, { useEffect, useState } from "react"
import { supabase } from "../supabaseClient"
import { FiCheckCircle, FiClock, FiChevronDown, FiChevronUp } from "react-icons/fi"

export default function AdminOccurrences() {
    const [occurrences, setOccurrences] = useState([])
    const [loading, setLoading] = useState(true)
    const [expandedKids, setExpandedKids] = useState({})
    const [expandedDates, setExpandedDates] = useState({})

    useEffect(() => {
        fetchOccurrences()
    }, [])

    async function fetchOccurrences() {
        setLoading(true)

        let res = await supabase
            .from('task_occurrences')
            .select(`
                id,
                kid_id,
                scheduled_date,
                status,
                completed_at,
                tasks:task_id (
                  title,
                  reward,
                  assigned_kid
                )
            `)
            .order('scheduled_date', { ascending: false })
            .limit(100);

        if (res.error && res.error.message?.includes('completed_at')) {
            res = await supabase
                .from('task_occurrences')
                .select(`
                    id,
                    kid_id,
                    scheduled_date,
                    status,
                    tasks:task_id (
                      title,
                      reward,
                      assigned_kid
                    )
                `)
                .order('scheduled_date', { ascending: false })
                .limit(100);
        }

        const occData = res.data || [];

        const { data: userData } = await supabase.from('users').select('id, name');
        const userMap = {};
        if (userData) {
            userData.forEach(u => userMap[u.id] = u.name);
        }

        const enrichedData = occData.map(d => ({
            ...d,
            kid_name: userMap[d.kid_id] || userMap[d.tasks?.assigned_kid] || 'Unknown Kid'
        }));

        setOccurrences(enrichedData);

        // Auto-expand all by default
        const initExpandedKids = {};
        const initExpandedDates = {};

        enrichedData.forEach(d => {
            initExpandedKids[d.kid_name] = true;
            initExpandedDates[`${d.kid_name}-${d.scheduled_date}`] = true;
        });

        setExpandedKids(initExpandedKids);
        setExpandedDates(initExpandedDates);

        setLoading(false);
    }

    async function approveTask(task) {
        if (!confirm(`Are you sure you want to approve "${task.tasks?.title}" for ${task.kid_name}?`)) return;

        const kidToReward = task.kid_id || task.tasks?.assigned_kid;

        await supabase
            .from('wallet_transactions')
            .insert({
                kid_id: kidToReward,
                amount: task.tasks?.reward,
                type: 'reward'
            });

        await supabase
            .from('task_occurrences')
            .update({ status: 'approved' })
            .eq('id', task.id);

        fetchOccurrences();
    }

    async function rejectTask(taskOccurrenceId) {
        if (!confirm(`Are you sure you want to reject this task occurrence?`)) return;

        await supabase
            .from('task_occurrences')
            .update({ status: 'pending' }) // revert to pending
            .eq('id', taskOccurrenceId);

        fetchOccurrences();
    }

    async function approveAllTasks(dailyOccs) {
        const toApprove = dailyOccs.filter(o => o.status === 'waiting_parent' || o.status === 'pending');
        if (toApprove.length === 0) return;
        if (!confirm(`Are you sure you want to approve and pay out ${toApprove.length} task(s) at once?`)) return;

        // Process all transactions concurrently
        await Promise.all(toApprove.map(async (task) => {
            const kidToReward = task.kid_id || task.tasks?.assigned_kid;
            await supabase.from('wallet_transactions').insert({
                kid_id: kidToReward, amount: task.tasks?.reward, type: 'reward'
            });
            await supabase.from('task_occurrences').update({ status: 'approved' }).eq('id', task.id);
        }));

        fetchOccurrences();
    }

    async function forceStatusChange(task, newStatus) {
        if (!newStatus || newStatus === task.status) return;
        if (!confirm(`Are you sure you want to forcefully change this task to '${newStatus}'?`)) return;

        if (newStatus === 'approved') {
            const kidToReward = task.kid_id || task.tasks?.assigned_kid;
            await supabase.from('wallet_transactions').insert({
                kid_id: kidToReward, amount: task.tasks?.reward, type: 'reward'
            });
            await supabase.from('task_occurrences').update({ status: 'approved' }).eq('id', task.id);
        } else {
            // Normal update without monetary payout
            await supabase.from('task_occurrences').update({ status: newStatus }).eq('id', task.id);
        }

        fetchOccurrences();
    }

    const toggleKid = (kidName) => setExpandedKids(prev => ({ ...prev, [kidName]: !prev[kidName] }));
    const toggleDate = (dateKey) => setExpandedDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));

    // Grouping: Kid -> Date -> Occurrences array
    const grouped = occurrences.reduce((acc, occ) => {
        const kidName = occ.kid_name;
        const date = occ.scheduled_date;

        if (!acc[kidName]) {
            acc[kidName] = {};
        }
        if (!acc[kidName][date]) {
            acc[kidName][date] = [];
        }
        acc[kidName][date].push(occ);
        return acc;
    }, {});

    return (
        <div style={{ padding: '20px' }}>
            <h1 style={{ marginBottom: '20px' }}>Task Occurrences 📋</h1>

            {loading ? (
                <p>Loading occurrences...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {occurrences.length === 0 && <p>No task occurrences found.</p>}

                    {Object.entries(grouped).map(([kidName, dates]) => (
                        <div key={kidName} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#f9fafb' }}>
                            <div
                                onClick={() => toggleKid(kidName)}
                                style={{ background: '#e5e7eb', padding: '15px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#111827' }}>👩‍👦 {kidName}</h2>
                                {expandedKids[kidName] ? <FiChevronUp size={24} /> : <FiChevronDown size={24} />}
                            </div>

                            {expandedKids[kidName] && (
                                <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {Object.entries(dates).map(([date, dailyOccs]) => {
                                        const dateKey = `${kidName}-${date}`;
                                        return (
                                            <div key={date} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                                                <div
                                                    onClick={() => toggleDate(dateKey)}
                                                    style={{ background: '#f3f4f6', padding: '10px 15px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#374151' }}>📅 {new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>

                                                        {dailyOccs.some(o => o.status === 'waiting_parent' || o.status === 'pending') && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); approveAllTasks(dailyOccs); }}
                                                                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                                                            >
                                                                Approve All Open ✅
                                                            </button>
                                                        )}
                                                    </div>
                                                    {expandedDates[dateKey] ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                                                </div>

                                                {expandedDates[dateKey] && (
                                                    <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {dailyOccs.map((occ) => (
                                                            <div key={occ.id} style={{
                                                                background: '#fff',
                                                                padding: '15px',
                                                                borderRadius: '8px',
                                                                border: '1px solid #e5e7eb',
                                                                borderLeft: occ.status === 'waiting_parent' ? '4px solid #facc15' : occ.status === 'approved' || occ.status === 'completed' ? '4px solid #4ade80' : '4px solid #e5e7eb',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between'
                                                            }}>
                                                                <div>
                                                                    <h4 style={{ margin: '0 0 5px 0', fontSize: '1rem' }}>{occ.tasks?.title}</h4>
                                                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                                                                        {occ.completed_at ? `Completed at: ${new Date(occ.completed_at).toLocaleTimeString()}` : 'No completion time'}
                                                                        <span style={{ fontWeight: 'bold', marginLeft: '10px', color: '#B45309' }}>• {occ.tasks?.reward} ر.س</span>
                                                                    </p>
                                                                    <div style={{ marginTop: '5px' }}>
                                                                        {occ.status === 'pending' && <span style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 'bold' }}><FiClock /> Pending</span>}
                                                                        {occ.status === 'waiting_parent' && <span style={{ color: '#ca8a04', fontSize: '0.75rem', fontWeight: 'bold' }}>Needs Approval 👀</span>}
                                                                        {(occ.status === 'approved' || occ.status === 'completed') && <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 'bold' }}><FiCheckCircle /> Approved</span>}
                                                                    </div>
                                                                </div>

                                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

                                                                    {occ.status === 'pending' && (
                                                                        <select
                                                                            value=""
                                                                            onChange={(e) => forceStatusChange(occ, e.target.value)}
                                                                            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '6px', fontSize: '0.85rem', background: '#f9fafb', cursor: 'pointer' }}
                                                                        >
                                                                            <option value="" disabled>Change Status (Force)...</option>
                                                                            <option value="waiting_parent">Force ➡️ Needs Approval</option>
                                                                            <option value="completed">Bypass ➡️ Completed (No Pay)</option>
                                                                            <option value="approved">Force ➡️ Approved & Paid</option>
                                                                        </select>
                                                                    )}

                                                                    {occ.status === 'waiting_parent' && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => approveTask(occ)}
                                                                                style={{ background: '#4ade80', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                                            >
                                                                                Approve
                                                                            </button>
                                                                            <button
                                                                                onClick={() => rejectTask(occ.id)}
                                                                                style={{ background: '#f87171', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                                            >
                                                                                Reject
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
