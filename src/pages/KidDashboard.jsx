import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { requestPushPermission, sendNotification } from "../pushManager";

export default function KidDashboard() {
  const [tasks, setTasks] = useState([]);
  const [balance, setBalance] = useState(0);
  const [activeTab, setActiveTab] = useState("tasks");
  const isPushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const [pushEnabled, setPushEnabled] = useState(isPushSupported && Notification.permission === 'granted');

  const nav = useNavigate();
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const kidId = user?.id;

  useEffect(() => {
    if (!user) {
      nav("/login");
      return;
    }
    fetchTasks();
    fetchBalance();

    if (isPushSupported && Notification.permission === 'granted') {
      requestPushPermission(kidId);
    }
  }, []);

  async function fetchTasks() {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('task_occurrences')
      .select(`
        id,
        status,
        tasks:task_id!inner (
          title,
          reward,
          assigned_kid
        )
      `)
      .eq('tasks.assigned_kid', kidId)
      .eq('scheduled_date', today);

    if (error) console.error("Error fetching tasks:", error);
    else setTasks(data || []);
  }

  async function fetchBalance() {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('kid_id', kidId);

    if (error) console.error("Error fetching balance:", error);
    else {
      let total = 0;
      data?.forEach(t => total += t.amount);
      setBalance(total);
    }
  }

  async function requestApproval(id, taskTitle) {
    const { error } = await supabase
      .from('task_occurrences')
      .update({ status: 'waiting_parent' })
      .eq('id', id);

    if (error) alert("Oops! Something went wrong.");
    else {
      alert("Sent to parent for approval! 🚀");
      sendNotification({
        title: 'Task Finished! 🚀',
        message: `${user?.name} just finished "${taskTitle}" and needs approval!`,
        targetRole: 'parent',
        url: '/login'
      });
      fetchTasks();
    }
  }

  async function requestWithdrawal(method) {
    if (balance <= 0) {
      alert("You need more points to withdraw! Keep completing tasks!");
      return;
    }

    const amount = prompt(`How much would you like to withdraw? (Max: ${balance} ر.س)`);
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) return;

    if (parseInt(amount) > balance) {
      alert("You don't have enough balance for that!");
      return;
    }

    const { error } = await supabase
      .from('withdrawals')
      .insert({
        kid_id: kidId,
        amount: parseInt(amount),
        method: method
      });

    if (error) alert("Oops! Something went wrong.");
    else alert("Withdrawal request sent! 🎉");
  }

  return (
    <div className="app-wrapper">
      <div className="content-area">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h1 className="title" style={{ textAlign: "left", fontSize: "1.5rem", margin: 0 }}>
            Hi, {user?.name}! 👋
          </h1>
          {isPushSupported && !pushEnabled && (
            <button
              onClick={async () => {
                const success = await requestPushPermission(kidId);
                if (success) setPushEnabled(true);
              }}
              style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", padding: "5px", animation: "pulse 2s infinite" }}
            >
              🔔
            </button>
          )}
        </div>

        <div className="card balance-card">
          <h2>Your Balance</h2>
          <div className="balance-amount">{balance} ر.س</div>
          <p style={{ color: "rgba(255,255,255,0.8)" }}>Awesome job! Keep it up! ⭐</p>
        </div>

        {activeTab === "tasks" && (
          <div>
            <h2 style={{ marginTop: "20px" }}>Today's Quests 🎯</h2>

            {tasks.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <span className="nav-icon" style={{ fontSize: "3rem" }}>🌴</span>
                <h3>No tasks right now!</h3>
                <p>Time to relax or ask your parent for new quests.</p>
              </div>
            ) : (
              tasks.map(t => (
                <div key={t.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: "1.2rem", flex: 1 }}>{t.tasks?.title}</h3>
                    <div style={{ background: "var(--warning)", color: "#B45309", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
                      {t.tasks?.reward} ر.س
                    </div>
                  </div>

                  <div style={{ marginTop: "12px" }}>
                    {t.status === "pending" && (
                      <button className="button" onClick={() => requestApproval(t.id, t.tasks?.title)}>
                        I Did It! ✅
                      </button>
                    )}

                    {t.status === "waiting_parent" && (
                      <div style={{ textAlign: "center", padding: "10px", background: "#FEF3C7", color: "#D97706", borderRadius: "12px", fontWeight: "bold" }}>
                        Waiting for Parent 👀
                      </div>
                    )}

                    {t.status === "approved" && (
                      <div style={{ textAlign: "center", padding: "10px", background: "#DCFCE7", color: "#16A34A", borderRadius: "12px", fontWeight: "bold" }}>
                        Approved & Paid! 🎉
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "rewards" && (
          <div>
            <h2 style={{ marginTop: "20px" }}>Claim Rewards 🎁</h2>
            <div className="card">
              <h3>Where do you want your money?</h3>
              <p style={{ marginBottom: "16px" }}>Choose a withdrawal method and your parent will approve it.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button className="button button-info" onClick={() => requestWithdrawal('cash')}>
                  💵 Real Cash
                </button>
                <button className="button button-secondary" onClick={() => requestWithdrawal('school')}>
                  🎒 School Card
                </button>
                <button className="button" style={{ background: "#9C27B0" }} onClick={() => requestWithdrawal('bank')}>
                  🏦 Bank Transfer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bottom-nav">
        <div
          className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <span className="nav-icon">✨</span>
          <span>Quests</span>
        </div>
        <div
          className={`nav-item ${activeTab === 'rewards' ? 'active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          <span className="nav-icon">🎁</span>
          <span>Rewards</span>
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
