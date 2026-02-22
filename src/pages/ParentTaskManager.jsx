import React, { useState, useEffect } from "react"
import { supabase } from "../supabaseClient"

export default function ParentTaskManager() {

    const [title, setTitle] = useState("")
    const [reward, setReward] = useState("")
    const [recurrence, setRecurrence] = useState("daily")
    const [taskType, setTaskType] = useState("prayer")

    const [kid, setKid] = useState("")
    const [kids, setKids] = useState([])

    useEffect(() => {
        async function fetchKids() {
            const { data } = await supabase
                .from('users')
                .select('*')
                .eq('role', 'kid')

            if (data && data.length > 0) {
                setKids(data)
                setKid(data[0].id)
            }
        }
        fetchKids()
    }, [])

    async function createTask() {
        if (!title || !reward) {
            alert("Please fill all fields");
            return;
        }

        const { error } = await supabase
            .from('tasks')
            .insert({
                title,
                reward: parseInt(reward),
                recurrence: recurrence,
                task_type: taskType,
                assigned_kid: kid,
                active: true
            })

        if (error) {
            console.error("Error creating task:", error)
            alert("Error: " + error.message)
            return;
        }

        alert("Task Created! ✅")
        setTitle("")
        setReward("")
    }

    return (
        <div className="card">

            <h2 style={{ marginTop: 0 }}>Create New Quest 📝</h2>

            <input
                className="user-select"
                style={{ width: '100%', marginBottom: '15px' }}
                placeholder="Quest Title (e.g. Wash Dishes)"
                value={title}
                onChange={e => setTitle(e.target.value)}
            />

            <input
                className="user-select"
                style={{ width: '100%', marginBottom: '15px' }}
                type="number"
                placeholder="Reward Amount (ر.س)"
                value={reward}
                onChange={e => setReward(e.target.value)}
            />

            <select
                className="user-select"
                style={{ width: '100%', marginBottom: '15px' }}
                value={taskType}
                onChange={e => setTaskType(e.target.value)}
            >
                <option value="prayer">Prayer</option>
                <option value="chore">Chore</option>
                <option value="homework">Homework</option>
                <option value="general">General Routine</option>
            </select>

            <select
                className="user-select"
                style={{ width: '100%', marginBottom: '15px' }}
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
            >
                <option value="daily">Every Day</option>
                <option value="weekly">Every Week</option>
                <option value="monthly">Every Month</option>
            </select>

            <select
                className="user-select"
                style={{ width: '100%', marginBottom: '20px' }}
                value={kid}
                onChange={e => setKid(e.target.value)}
            >
                {kids.map(k => (
                    <option key={k.id} value={k.id}>
                        {k.name}
                    </option>
                ))}
            </select>

            <button className="button" onClick={createTask}>
                Create Quest
            </button>

        </div>
    )
}
