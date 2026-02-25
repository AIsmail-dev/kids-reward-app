import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { requestPushPermission, sendNotification } from "../pushManager";

export default function ParentDashboard() {
    const [completed, setCompleted] = useState([]);
    const [withdrawals, setWithdrawals] = useState([]);
    const [activeTab, setActiveTab] = useState("approvals");
    const nav = useNavigate();

    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;

    const isPushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    const [pushEnabled, setPushEnabled] = useState(isPushSupported && Notification.permission === 'granted');

    useEffect(() => {
        fetchCompletedTasks();
        fetchWithdrawals();

        if (isPushSupported && Notification.permission === 'granted') {
            requestPushPermission(user?.id);
        }
    }, []);

    async function fetchCompletedTasks() {
        const { data } = await supabase
            .from('task_occurrences')
            .select(`
        id,
        kid_id,
        scheduled_date,
        tasks:task_id (
          title,
          reward,
          assigned_kid
        )
      `)
            .in('status', ['completed', 'waiting_parent'])
            .eq('scheduled_date', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }));

        const { data: userData } = await supabase.from('users').select('id, name');
        const userMap = {};
        if (userData) {
            userData.forEach(u => userMap[u.id] = u.name);
        }

        if (data) {
            const enrichedData = data.map(d => ({
                ...d,
                users: { name: userMap[d.kid_id] }
            }));
            setCompleted(enrichedData);
        } else {
            setCompleted([]);
        }
    }

    async function fetchWithdrawals() {
        const { data } = await supabase
            .from('withdrawals')
            .select('*')
            .eq('status', 'pending');

        setWithdrawals(data);
    }

    async function approveTask(task) {
        const kidToReward = task.kid_id || task.tasks.assigned_kid;

        await supabase
            .from('wallet_transactions')
            .insert({
                kid_id: kidToReward,
                amount: task.tasks.reward,
                type: 'reward'
            });

        await supabase
            .from('task_occurrences')
            .update({ status: 'approved' })
            .eq('id', task.id);

        sendNotification({
            title: 'Task Approved! 🌟',
            message: `Your parent approved "${task.tasks?.title}" and you earned ${task.tasks?.reward} ر.س!`,
            targetKidId: kidToReward,
            url: '/login',
            type: 'notify_kid'
        });

        fetchCompletedTasks();
    }

    async function approveWithdrawal(w) {
        await supabase
            .from('wallet_transactions')
            .insert({
                kid_id: w.kid_id,
                amount: -w.amount,
                type: 'withdraw'
            });

        await supabase
            .from('withdrawals')
            .update({ status: 'approved' })
            .eq('id', w.id);

        fetchWithdrawals();
    }

    return (
        <div className="app-wrapper">
            <div className="content-area">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h1 className="title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>
                        Parent Dashboard 👨‍👩‍👧‍👦
                    </h1>
                    {isPushSupported && !pushEnabled && (
                        <button
                            onClick={async () => {
                                const success = await requestPushPermission(user?.id);
                                if (success) setPushEnabled(true);
                            }}
                            style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", padding: "5px", animation: "pulse 2s infinite" }}
                        >
                            🔔
                        </button>
                    )}
                </div>

                {activeTab === "approvals" && (
                    <div>
                        <h2 style={{ marginTop: "20px" }}>Needs Approval ✅</h2>

                        {completed?.length === 0 && (
                            <p style={{ textAlign: "center", color: "#666" }}>No tasks pending approval.</p>
                        )}

                        {completed?.map(t => (
                            <div key={t.id} className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <h3 style={{ margin: 0, fontSize: "1.1rem", flex: 1 }}>{t.tasks?.title}</h3>
                                    <div style={{ background: "var(--warning)", color: "#B45309", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
                                        {t.tasks?.reward} ر.س
                                    </div>
                                </div>
                                <p style={{ margin: "5px 0 0", color: "#666", fontSize: "0.9rem" }}>
                                    {t.users?.name || 'Unknown'} • {new Date(t.scheduled_date).toLocaleDateString()}
                                </p>
                                <div style={{ marginTop: "12px" }}>
                                    <button className="button button-secondary" onClick={() => approveTask(t)}>
                                        Approve Task
                                    </button>
                                </div>
                            </div>
                        ))}

                        <h2 style={{ marginTop: "30px" }}>Withdrawal Requests 💵</h2>

                        {withdrawals?.length === 0 && (
                            <p style={{ textAlign: "center", color: "#666" }}>No withdrawal requests right now.</p>
                        )}

                        {withdrawals?.map(w => (
                            <div key={w.id} className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <h3 style={{ margin: 0, fontSize: "1.1rem", flex: 1, textTransform: "capitalize" }}>{w.method}</h3>
                                    <div style={{ background: "var(--warning)", color: "#B45309", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold", fontSize: "1.2rem" }}>
                                        {w.amount} ر.س
                                    </div>
                                </div>
                                <div style={{ marginTop: "12px" }}>
                                    <button className="button button-info" onClick={() => approveWithdrawal(w)}>
                                        Approve Payout
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bottom-nav">
                <div
                    className={`nav-item ${activeTab === 'approvals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('approvals')}
                >
                    <span className="nav-icon">✅</span>
                    <span>Approvals</span>
                </div>
                <div
                    className="nav-item"
                    onClick={() => nav("/admin")}
                >
                    <span className="nav-icon">💻</span>
                    <span>Admin</span>
                </div>
                <div
                    className="nav-item"
                    onClick={() => {
                        localStorage.removeItem("user");
                        nav("/login");
                    }}
                >
                    <span className="nav-icon">🚪</span>
                    <span>Logout</span>
                </div>
            </div>
        </div>
    );
}
