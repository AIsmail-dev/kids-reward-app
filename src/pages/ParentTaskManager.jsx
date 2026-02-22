import React, { useState } from "react"
import { supabase } from "../supabaseClient"

export default function ParentTaskManager() {

    const [title, setTitle] = useState("")
    const [reward, setReward] = useState("")
    const [repeat, setRepeat] = useState("daily")
    const [kid, setKid] = useState("11111111-1111-1111-1111-111111111111")

    async function createTask() {
        if (!title || !reward) {
            alert("Please fill all fields");
            return;
        }

        await supabase
            .from('tasks')
            .insert({
                title,
                reward: parseInt(reward),
                repeat_type: repeat,
                kid_id: kid,
                active: true
            })

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
                placeholder="Reward Amount ($)"
                value={reward}
                onChange={e => setReward(e.target.value)}
            />

            <select
                className="user-select"
                style={{ width: '100%', marginBottom: '15px' }}
                value={repeat}
                onChange={e => setRepeat(e.target.value)}
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
                <option value="11111111-1111-1111-1111-111111111111">
                    Farida
                </option>
                <option value="22222222-2222-2222-2222-222222222222">
                    Yahia
                </option>
                <option value="33333333-3333-3333-3333-333333333333">
                    Ahmed
                </option>
            </select>

            <button className="button" onClick={createTask}>
                Create Quest
            </button>

        </div>
    )
}
