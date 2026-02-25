import React, { useEffect, useState } from "react"
import { supabase } from "../supabaseClient"
import { FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi"

export default function AdminOccurrences() {
    const [occurrences, setOccurrences] = useState([])
    const [loading, setLoading] = useState(true)

    // filter states optionally
    // const [statusFilter, setStatusFilter] = useState('all')

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

    return (
        <div style={{ padding: '20px' }}>
            <h1 style={{ marginBottom: '20px' }}>Task Occurrences 📋</h1>

            {loading ? (
                <p>Loading occurrences...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {occurrences.length === 0 && <p>No task occurrences found.</p>}
                    {occurrences.map(occ => (
                        <div key={occ.id} style={{
                            background: '#fff',
                            padding: '15px',
                            borderRadius: '12px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderLeft: occ.status === 'waiting_parent' ? '4px solid #facc15' : occ.status === 'approved' || occ.status === 'completed' ? '4px solid #4ade80' : '4px solid #e5e7eb'
                        }}>
                            <div>
                                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{occ.tasks?.title}</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                                    {occ.kid_name} • {new Date(occ.scheduled_date).toLocaleDateString()}
                                    {occ.completed_at ? `  (Time: ${new Date(occ.completed_at).toLocaleTimeString()})` : ''}
                                    <span style={{ fontWeight: 'bold', marginLeft: '10px' }}>• {occ.tasks?.reward} ر.س</span>
                                </p>
                                <div style={{ marginTop: '5px' }}>
                                    {occ.status === 'pending' && <span style={{ color: '#6b7280', fontSize: '0.85rem' }}><FiClock /> Pending</span>}
                                    {occ.status === 'waiting_parent' && <span style={{ color: '#ca8a04', fontSize: '0.85rem', fontWeight: 'bold' }}>Needs Approval 👀</span>}
                                    {(occ.status === 'approved' || occ.status === 'completed') && <span style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 'bold' }}><FiCheckCircle /> Approved</span>}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                {occ.status === 'waiting_parent' && (
                                    <>
                                        <button
                                            onClick={() => approveTask(occ)}
                                            style={{ background: '#4ade80', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => rejectTask(occ.id)}
                                            style={{ background: '#f87171', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
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
}
