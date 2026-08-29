import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { requestPushPermission, sendNotification } from "../pushManager";

export default function KidDashboard() {
  const [tasks, setTasks] = useState([]);
  const [balance, setBalance] = useState(0);
  const [moneyBalance, setMoneyBalance] = useState(0);
  const [screenBalance, setScreenBalance] = useState(0);
  const [rates, setRates] = useState([]);
  const [destinations, setDestinations] = useState([]);
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
    fetchBalances();
    fetchRates();
    fetchDestinations();

    if (isPushSupported && Notification.permission === 'granted') {
      requestPushPermission(kidId);
    }
  }, []);

  async function fetchTasks() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

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

  async function fetchBalances() {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('wallet, amount')
      .eq('kid_id', kidId);

    if (error) {
      console.error("Error fetching balances:", error);
      return;
    }

    const totals = { points: 0, money: 0, screen_time: 0 };
    data?.forEach(t => { totals[t.wallet] = (totals[t.wallet] || 0) + t.amount; });
    setBalance(totals.points);
    setMoneyBalance(totals.money);
    setScreenBalance(totals.screen_time);
  }

  async function fetchRates() {
    const { data, error } = await supabase.from('wallet_rates').select('*');
    if (error) console.error("Error fetching rates:", error);
    else setRates(data || []);
  }

  async function fetchDestinations() {
    const { data, error } = await supabase
      .from('money_destinations')
      .select('*')
      .eq('active', true)
      .order('name');
    if (error) console.error("Error fetching destinations:", error);
    else setDestinations(data || []);
  }

  function rateFor(wallet) {
    return rates.find(r => r.wallet === wallet);
  }

  async function convertPoints(wallet) {
    const rate = rateFor(wallet);
    if (!rate) return;
    if (balance <= 0) {
      alert("You need more points to convert! Keep completing tasks!");
      return;
    }

    const points = prompt(`How many points would you like to convert into ${rate.unit_label}? (Max: ${balance})`);
    if (!points || isNaN(points) || parseInt(points) <= 0) return;

    const pointsSpent = parseInt(points);
    if (pointsSpent > balance) {
      alert("You don't have enough points for that!");
      return;
    }

    const unitAmount = pointsSpent / rate.points_per_unit;

    const { error } = await supabase.from('wallet_transactions').insert([
      { kid_id: kidId, wallet: 'points', amount: -pointsSpent, type: 'convert' },
      { kid_id: kidId, wallet, amount: unitAmount, type: 'convert' },
    ]);

    if (error) alert("Oops! Something went wrong.");
    else {
      alert(`Converted ${pointsSpent} points into ${unitAmount} ${rate.unit_label}! 🎉`);
      fetchBalances();
    }
  }

  async function requestMoneyPayout() {
    if (moneyBalance <= 0) {
      alert("You don't have any money to request yet — convert some points first!");
      return;
    }
    if (destinations.length === 0) {
      alert("No payout destinations set up yet — ask your parent!");
      return;
    }

    const list = destinations.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
    const choice = prompt(`Where should it go?\n${list}\n\nEnter a number:`);
    const dest = destinations[parseInt(choice) - 1];
    if (!dest) return;

    const amount = prompt(`How much (Max: ${moneyBalance})?`);
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
    const value = parseFloat(amount);
    if (value > moneyBalance) {
      alert("You don't have that much in your Money wallet!");
      return;
    }

    const { error } = await supabase.from('wallet_requests').insert({
      kid_id: kidId,
      wallet: 'money',
      amount: value,
      destination_id: dest.id,
    });

    if (error) alert("Oops! Something went wrong.");
    else alert(`Request sent to send ${value} to ${dest.name}! 🎉`);
  }

  async function requestScreenTime() {
    if (screenBalance <= 0) {
      alert("You don't have any screen time banked yet — convert some points first!");
      return;
    }

    const amount = prompt(`How many minutes would you like to use (Max: ${screenBalance})?`);
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
    const value = parseFloat(amount);
    if (value > screenBalance) {
      alert("You don't have that much screen time banked!");
      return;
    }

    const when = prompt(`Which day? Type "today", "tomorrow", or a date (YYYY-MM-DD)`);
    if (!when) return;

    let scheduledDate;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
    if (when.trim().toLowerCase() === 'today') {
      scheduledDate = todayStr;
    } else if (when.trim().toLowerCase() === 'tomorrow') {
      const t = new Date(todayStr);
      t.setDate(t.getDate() + 1);
      scheduledDate = t.toISOString().split('T')[0];
    } else {
      scheduledDate = when.trim();
    }

    const { error } = await supabase.from('wallet_requests').insert({
      kid_id: kidId,
      wallet: 'screen_time',
      amount: value,
      scheduled_date: scheduledDate,
    });

    if (error) alert("Oops! Something went wrong.");
    else alert(`Request sent for ${value} minutes on ${scheduledDate}! 🎉`);
  }

  async function requestApproval(id, taskTitle) {
    let payload = {
      status: 'waiting_parent',
      completed_at: new Date().toISOString(),
      updated_by_name: user?.name || "Kid"
    };

    let res = await supabase.from('task_occurrences').update(payload).eq('id', id);

    if (res.error && (res.error.message?.includes('completed_at') || res.error.message?.includes('updated_by_name'))) {
      res = await supabase
        .from('task_occurrences')
        .update({ status: 'waiting_parent' })
        .eq('id', id);
    }

    if (res.error) alert("Oops! Something went wrong.");
    else {
      alert("Sent to parent for approval! 🚀");
      sendNotification({
        title: 'Task Finished! 🚀',
        message: `${user?.name} just finished "${taskTitle}" and needs approval!`,
        targetRole: 'parent',
        url: '/login',
        type: 'notify_parent'
      });
      fetchTasks();
    }
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
          <h2>Your Points</h2>
          <div className="balance-amount">{balance} ⭐</div>
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
                      {t.tasks?.reward} ⭐
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

                    {t.status === "completed" && (
                      <div style={{ textAlign: "center", padding: "10px", background: "#DBEAFE", color: "#2563EB", borderRadius: "12px", fontWeight: "bold" }}>
                        Approved (No Pay)
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
            <h2 style={{ marginTop: "20px" }}>Your Wallets 🎁</h2>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>💰 Money Wallet</h3>
                <div style={{ background: "var(--warning)", color: "#B45309", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
                  {moneyBalance} {rateFor('money')?.unit_label}
                </div>
              </div>
              <p style={{ margin: "8px 0 16px", color: "#666", fontSize: "0.9rem" }}>
                {rateFor('money')?.points_per_unit} ⭐ = 1 {rateFor('money')?.unit_label}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button className="button button-secondary" onClick={() => convertPoints('money')}>
                  Convert Points → Money
                </button>
                <button className="button button-info" onClick={requestMoneyPayout}>
                  Request Payout
                </button>
              </div>
            </div>

            <div className="card" style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>⏰ Screen Time Wallet</h3>
                <div style={{ background: "var(--warning)", color: "#B45309", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
                  {screenBalance} {rateFor('screen_time')?.unit_label}
                </div>
              </div>
              <p style={{ margin: "8px 0 16px", color: "#666", fontSize: "0.9rem" }}>
                {rateFor('screen_time')?.points_per_unit} ⭐ = 1 {rateFor('screen_time')?.unit_label}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button className="button button-secondary" onClick={() => convertPoints('screen_time')}>
                  Convert Points → Screen Time
                </button>
                <button className="button" style={{ background: "#9C27B0" }} onClick={requestScreenTime}>
                  Request to Use
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
