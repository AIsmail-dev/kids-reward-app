import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"

export default function AdminTasks() {
    const [tasks, setTasks] = useState([])
    const [kids, setKids] = useState([])

    // Form fields
    const [title, setTitle] = useState("")
    const [reward, setReward] = useState("1")
    const [taskType, setTaskType] = useState("prayer")
    const [recurrence, setRecurrence] = useState("daily")
    const [kidId, setKidId] = useState("")
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetchKids()
        fetchTasks()
    }, [])

    async function fetchKids() {
        const { data } = await supabase.from('users').select('*').eq('role', 'kid')
        if (data && data.length > 0) {
            setKids(data)
            setKidId(data[0].id)
        }
    }

    async function fetchTasks() {
        const { data } = await supabase
            .from('tasks')
            .select(`
                *,
                users!tasks_assigned_kid_fkey (name)
            `)
            .order('created_at', { ascending: false })
        setTasks(data || [])
    }

    async function handleCreateTask(e) {
        e.preventDefault()
        if (!title || !reward || !kidId) {
            alert("Please fill all required fields")
            return
        }

        setLoading(true)
        const { error } = await supabase
            .from('tasks')
            .insert({
                title,
                reward: parseInt(reward),
                task_type: taskType,
                recurrence,
                assigned_kid: kidId,
                active: true
            })

        setLoading(false)
        if (error) {
            alert("Error creating task: " + error.message)
            return
        }

        setTitle("")
        fetchTasks()
    }

    async function handleDelete(id) {
        if (!window.confirm("Are you sure you want to delete this task?")) return

        await supabase.from('tasks').delete().eq('id', id)
        fetchTasks()
    }

    async function toggleActive(task) {
        await supabase
            .from('tasks')
            .update({ active: !task.active })
            .eq('id', task.id)
        fetchTasks()
    }

    return (
        <div>
            <div className="admin-header">
                <h1>Manage Kids Tasks</h1>
            </div>

            <div className="admin-card">
                <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Create New Task</h3>
                <form onSubmit={handleCreateTask} style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>

                    <div className="admin-form-group" style={{ flex: '1 1 200px' }}>
                        <label>Task Title</label>
                        <input
                            className="admin-input"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Wash Dishes"
                        />
                    </div>

                    <div className="admin-form-group" style={{ flex: '1 1 100px' }}>
                        <label>Reward (ر.س)</label>
                        <input
                            type="number"
                            className="admin-input"
                            value={reward}
                            onChange={e => setReward(e.target.value)}
                        />
                    </div>

                    <div className="admin-form-group" style={{ flex: '1 1 150px' }}>
                        <label>Task Type</label>
                        <select className="admin-input" value={taskType} onChange={e => setTaskType(e.target.value)}>
                            <option value="prayer">Prayer</option>
                            <option value="chore">Chore</option>
                            <option value="homework">Homework</option>
                            <option value="general">General Routine</option>
                        </select>
                    </div>

                    <div className="admin-form-group" style={{ flex: '1 1 150px' }}>
                        <label>Recurrence</label>
                        <select className="admin-input" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                            <option value="daily">Every Day</option>
                            <option value="weekly">Every Week</option>
                            <option value="monthly">Every Month</option>
                        </select>
                    </div>

                    <div className="admin-form-group" style={{ flex: '1 1 150px' }}>
                        <label>Assign To</label>
                        <select className="admin-input" value={kidId} onChange={e => setKidId(e.target.value)}>
                            {kids.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                    </div>

                    <div className="admin-form-group" style={{ flex: '1 1 100%', textAlign: 'right' }}>
                        <button type="submit" className="admin-btn" disabled={loading}>
                            {loading ? 'Creating...' : '+ Create Task'}
                        </button>
                    </div>

                </form>
            </div>

            <div className="admin-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Title</th>
                            <th>Kid</th>
                            <th>Reward</th>
                            <th>Type</th>
                            <th>Recurrence</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map(t => (
                            <tr key={t.id}>
                                <td>
                                    <span
                                        style={{
                                            padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                            backgroundColor: t.active ? '#dcfce7' : '#fee2e2',
                                            color: t.active ? '#16a34a' : '#ef4444',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => toggleActive(t)}
                                    >
                                        {t.active ? 'Active' : 'Paused'}
                                    </span>
                                </td>
                                <td style={{ fontWeight: '500' }}>{t.title}</td>
                                <td>{t.users?.name || 'Unknown'}</td>
                                <td>{t.reward} ر.س</td>
                                <td style={{ textTransform: 'capitalize' }}>{t.task_type}</td>
                                <td style={{ textTransform: 'capitalize' }}>{t.recurrence}</td>
                                <td>
                                    <button
                                        className="admin-btn admin-btn-danger"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                        onClick={() => handleDelete(t.id)}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {tasks.length === 0 && (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                                    No tasks created yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    )
}
