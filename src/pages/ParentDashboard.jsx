import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { requestPushPermission, sendNotification } from "../pushManager";

export default function ParentDashboard() {
    const [completed, setCompleted] = useState([]);
    const [requests, setRequests] = useState([]);
    const [toFulfill, setToFulfill] = useState([]);
    const [kidNames, setKidNames] = useState({});
    const [activeTab, setActiveTab] = useState("approvals");
    const nav = useNavigate();

    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;

    const isPushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    const [pushEnabled, setPushEnabled] = useState(isPushSupported && Notification.permission === 'granted');

    useEffect(() => {
        fetchCompletedTasks();
        fetchRequests();

        if (isPushSupported && Notification.permission === 'granted') {
            requestPushPermission(user?.id);
        }
    }, []);

    async function fetchCompletedTasks() {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

        // Attempt fetch with completed_at tracking
        let res = await supabase
            .from('task_occurrences')
            .select(`
                id,
                kid_id,
                scheduled_date,
                completed_at,
                updated_by_name,
                tasks:task_id (
                  title,
                  reward,
                  assigned_kid
                )
            `)
            .eq('status', 'waiting_parent')
            .eq('scheduled_date', todayStr);

        // Fallback gracefully if completed_at column isn't tracked yet in DB
        if (res.error && res.error.message?.includes('completed_at')) {
            res = await supabase
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
                .eq('status', 'waiting_parent')
                .eq('scheduled_date', todayStr);
        }

        const data = res.data;

        const { data: userData } = await supabase.from('users').select('id, name');
        const userMap = {};
        if (userData) {
            userData.forEach(u => userMap[u.id] = u.name);
        }

        if (data) {
            const enrichedData = data.map(d => ({
                ...d,
                users: { name: userMap[d.kid_id] || userMap[d.tasks?.assigned_kid] || 'Unknown Kid' }
            }));
            setCompleted(enrichedData);
        } else {
            setCompleted([]);
        }
    }

    async function fetchRequests() {
        const { data: userData } = await supabase.from('users').select('id, name');
        const nameMap = {};
        userData?.forEach(u => nameMap[u.id] = u.name);
        setKidNames(nameMap);

        const { data: pending } = await supabase
            .from('wallet_requests')
            .select('*, money_destinations(name)')
            .eq('status', 'pending');
        setRequests(pending || []);

        const { data: approved } = await supabase
            .from('wallet_requests')
            .select('*, money_destinations(name)')
            .eq('status', 'approved');
        setToFulfill(approved || []);
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
            .update({ status: 'approved', completed_at: task.completed_at || new Date().toISOString(), updated_by_name: user?.name || "Parent" })
            .eq('id', task.id);

        sendNotification({
            title: 'Task Approved! 🌟',
            message: `Your parent approved "${task.tasks?.title}" and you earned ${task.tasks?.reward} points!`,
            targetKidId: kidToReward,
            url: '/login',
            type: 'notify_kid'
        });

        fetchCompletedTasks();
    }

    async function approveRequest(r) {
        await supabase
            .from('wallet_transactions')
            .insert({
                kid_id: r.kid_id,
                wallet: r.wallet,
                amount: -r.amount,
                type: 'withdraw',
                request_id: r.id
            });

        await supabase
            .from('wallet_requests')
            .update({ status: 'approved' })
            .eq('id', r.id);

        const kidName = kidNames[r.kid_id] || 'Your kid';
        const isMoney = r.wallet === 'money';
        const what = isMoney
            ? `${r.amount} to ${r.money_destinations?.name}`
            : `${r.amount} minutes on ${r.scheduled_date}`;

        sendNotification({
            title: 'Request Approved! 🎉',
            message: `Your request for ${what} was approved!`,
            targetKidId: r.kid_id,
            url: '/login',
            type: 'notify_kid'
        });

        sendNotification({
            title: isMoney ? 'Reminder: send the money 💰' : 'Reminder: add the screen time ⏰',
            message: isMoney
                ? `Don't forget to actually send ${kidName} ${what}.`
                : `Don't forget to add ${what} in Screen Time / Family Link for ${kidName}.`,
            targetRole: 'parent',
            url: '/parent',
            type: 'notify_parent'
        });

        fetchRequests();
    }

    async function rejectRequest(r) {
        await supabase
            .from('wallet_requests')
            .update({ status: 'rejected' })
            .eq('id', r.id);

        fetchRequests();
    }

    async function fulfillRequest(r) {
        await supabase
            .from('wallet_requests')
            .update({
                status: 'fulfilled',
                fulfilled_at: new Date().toISOString(),
                fulfilled_by_name: user?.name || "Parent"
            })
            .eq('id', r.id);

        fetchRequests();
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
                                        {t.tasks?.reward} ⭐
                                    </div>
                                </div>
                                <p style={{ margin: "5px 0 0", color: "#666", fontSize: "0.9rem" }}>
                                    {t.users?.name || 'Unknown'} • {t.completed_at ? `Requested: ${new Date(t.completed_at).toLocaleString('en-US', { timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : `Scheduled: ${new Date(t.scheduled_date).toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' })}`}
                                    {t.updated_by_name && <span style={{ marginLeft: '6px', fontWeight: 'bold', color: '#6366f1' }}>(by {t.updated_by_name})</span>}
                                </p>
                                <div style={{ marginTop: "12px" }}>
                                    <button className="button button-secondary" onClick={() => approveTask(t)}>
                                        Approve Task
                                    </button>
                                </div>
                            </div>
                        ))}

                        <h2 style={{ marginTop: "30px" }}>Wallet Requests 🎁</h2>

                        {requests?.length === 0 && (
                            <p style={{ textAlign: "center", color: "#666" }}>No wallet requests right now.</p>
                        )}

                        {requests?.map(r => (
                            <div key={r.id} className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <h3 style={{ margin: 0, fontSize: "1.1rem", flex: 1 }}>
                                        {r.wallet === 'money' ? `💰 → ${r.money_destinations?.name}` : `⏰ Screen Time — ${r.scheduled_date}`}
                                    </h3>
                                    <div style={{ background: "var(--warning)", color: "#B45309", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold", fontSize: "1.2rem" }}>
                                        {r.amount}
                                    </div>
                                </div>
                                <p style={{ margin: "5px 0 0", color: "#666", fontSize: "0.9rem" }}>
                                    {kidNames[r.kid_id] || 'Unknown'}
                                </p>
                                <div style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
                                    <button className="button button-info" onClick={() => approveRequest(r)}>
                                        Approve
                                    </button>
                                    <button className="button" style={{ background: '#ef4444', color: 'white' }} onClick={() => rejectRequest(r)}>
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}

                        {toFulfill?.length > 0 && (
                            <>
                                <h2 style={{ marginTop: "30px" }}>Ready to Give 🎉</h2>
                                {toFulfill.map(r => (
                                    <div key={r.id} className="card">
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <h3 style={{ margin: 0, fontSize: "1.1rem", flex: 1 }}>
                                                {r.wallet === 'money' ? `💰 → ${r.money_destinations?.name}` : `⏰ Screen Time — ${r.scheduled_date}`}
                                            </h3>
                                            <div style={{ background: "#DCFCE7", color: "#16A34A", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
                                                {r.amount}
                                            </div>
                                        </div>
                                        <p style={{ margin: "5px 0 0", color: "#666", fontSize: "0.9rem" }}>
                                            {kidNames[r.kid_id] || 'Unknown'}
                                        </p>
                                        <div style={{ marginTop: "12px" }}>
                                            <button className="button" onClick={() => fulfillRequest(r)}>
                                                Mark as Given ✅
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
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
                        localStorage.removeItem("token");
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
