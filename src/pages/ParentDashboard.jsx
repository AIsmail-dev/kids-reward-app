import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestPushPermission } from "../pushManager";
import { useNotice, useAutoRefresh, logout } from "../notice";
import ApproveTab from "../parent/ApproveTab";
import KidsTab from "../parent/KidsTab";
import TasksTab from "../parent/TasksTab";
import SettingsTab from "../parent/SettingsTab";

const TABS = [
    ['approve', '✅', 'Approve'],
    ['kids', '👧', 'Kids'],
    ['tasks', '📋', 'Tasks'],
    ['settings', '⚙️', 'Settings'],
];

// The one parent screen: approvals, kids, tasks and settings as tabs.
export default function ParentDashboard() {
    const [tab, setTab] = useState("approve");
    const [waiting, setWaiting] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);
    const [noticeElement, notify] = useNotice();
    const nav = useNavigate();

    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;

    const isPushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    const [pushEnabled, setPushEnabled] = useState(isPushSupported && Notification.permission === 'granted');

    useEffect(() => {
        if (user?.role !== 'parent') {
            nav(user ? "/kid" : "/login");
            return;
        }
        if (isPushSupported && Notification.permission === 'granted') {
            requestPushPermission(user.id);
        }
    }, []);

    useAutoRefresh(() => setRefreshKey(k => k + 1));

    if (user?.role !== 'parent') return null;

    return (
        <div className="app-wrapper">
            {noticeElement}
            <div className="content-area">
                <div className="top-bar">
                    <h1>{TABS.find(t => t[0] === tab)[2]}</h1>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {isPushSupported && !pushEnabled && (
                            <button
                                className="link-button"
                                style={{ fontSize: "1.4rem", animation: "pulse 2s infinite" }}
                                onClick={async () => {
                                    if (await requestPushPermission(user.id)) setPushEnabled(true);
                                }}
                            >
                                🔔
                            </button>
                        )}
                        <button className="link-button" onClick={() => logout(nav)}>Log out</button>
                    </div>
                </div>

                {tab === 'approve' && <ApproveTab user={user} notify={notify} onCount={setWaiting} refreshKey={refreshKey} />}
                {tab === 'kids' && <KidsTab user={user} notify={notify} refreshKey={refreshKey} />}
                {tab === 'tasks' && <TasksTab notify={notify} refreshKey={refreshKey} />}
                {tab === 'settings' && <SettingsTab notify={notify} />}
            </div>

            <div className="bottom-nav">
                {TABS.map(([key, icon, label]) => (
                    <div key={key} className={`nav-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
                        <span className="nav-icon">{icon}</span>
                        <span>{label}</span>
                        {key === 'approve' && waiting > 0 && <span className="nav-badge">{waiting}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}
