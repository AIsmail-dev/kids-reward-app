import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { requestPushPermission, sendNotification } from "../pushManager";
import { useNotice, useAutoRefresh, todayInRiyadh, timeInRiyadh, logout } from "../notice";

const SCREEN_MINUTES = [15, 30, 60];
// Sony's play-time limits move in 15-minute steps.
const PLAYSTATION_MINUTES = [15, 30, 45, 60];
const EXCEPTIONAL = /^\[Exceptional\]\s*/;

export default function KidDashboard() {
  const [tasks, setTasks] = useState([]);
  const [points, setPoints] = useState(0);
  const [rates, setRates] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activeTab, setActiveTab] = useState("today");
  const [sending, setSending] = useState(false);
  const [moneyDest, setMoneyDest] = useState(null);
  const [moneyAmount, setMoneyAmount] = useState("");
  const [noticeElement, notify] = useNotice();
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
    fetchPoints();
    fetchRequests();
    fetchRates();
    fetchDestinations();

    if (isPushSupported && Notification.permission === 'granted') {
      requestPushPermission(kidId);
    }
  }, []);

  useAutoRefresh(() => {
    fetchTasks();
    fetchPoints();
    fetchRequests();
  });

  async function fetchTasks() {
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
      .eq('scheduled_date', todayInRiyadh());

    if (error) console.error("Error fetching tasks:", error);
    else setTasks(data || []);
  }

  async function fetchPoints() {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('kid_id', kidId)
      .eq('wallet', 'points');
    if (error) console.error("Error fetching points:", error);
    else setPoints((data || []).reduce((sum, t) => sum + Number(t.amount), 0));
  }

  // Requests still in progress, plus screen time that is running right now.
  async function fetchRequests() {
    const { data, error } = await supabase
      .from('wallet_requests')
      .select('id, wallet, amount, points_cost, status, familylink_status, familylink_ends_at, money_destinations(name)')
      .eq('kid_id', kidId)
      .or(`status.in.(pending,approved),familylink_ends_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false });
    if (error) console.error("Error fetching requests:", error);
    else setRequests(data || []);
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

  const rateFor = (wallet) => rates.find(r => r.wallet === wallet);
  const costOf = (wallet, amount) => Math.round(amount * (rateFor(wallet)?.points_per_unit || 0) * 100) / 100;
  // Points already asked for but not yet approved can't be spent twice.
  const reserved = requests.filter(r => r.status === 'pending').reduce((sum, r) => sum + Number(r.points_cost || 0), 0);
  const available = points - reserved;

  async function markDone(id, taskTitle) {
    // Hide the button immediately so repeated taps can't re-send while the request is in flight
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'waiting_parent' } : t));

    // Only transition from 'pending', and only notify if this call actually did the transition
    const res = await supabase
      .from('task_occurrences')
      .update({ status: 'waiting_parent', completed_at: new Date().toISOString(), updated_by_name: user?.name || "Kid" })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');

    if (res.error) {
      notify("Oops! Something went wrong. Try again.", 'error');
    } else if (res.data?.length) {
      sendNotification({
        title: 'Task Finished! 🚀',
        message: `${user?.name} just finished "${taskTitle}" and needs approval!`,
        targetRole: 'parent',
        url: '/parent',
        type: 'notify_parent'
      });
      notify("Sent to your parent! 🚀");
    }
    fetchTasks();
  }

  async function ask(wallet, amount, destination) {
    setSending(true);
    const { error } = await supabase.from('wallet_requests').insert({
      kid_id: kidId,
      wallet,
      amount,
      destination_id: destination?.id || null,
      scheduled_date: wallet === 'screen_time' ? todayInRiyadh() : null,
    });
    setSending(false);

    if (error) {
      notify("Oops! Something went wrong. Try again.", 'error');
      return;
    }
    const what = wallet === 'screen_time'
      ? `${amount} min of screen time`
      : wallet === 'playstation_time'
        ? `${amount} min of PlayStation`
        : `${amount} ${rateFor('money')?.unit_label} to ${destination.name}`;
    sendNotification({
      title: wallet === 'screen_time' ? 'Screen time request ⏰' : wallet === 'playstation_time' ? 'PlayStation request 🎮' : 'Money request 💰',
      message: `${user?.name} is asking for ${what} (${costOf(wallet, amount)} ⭐).`,
      targetRole: 'parent',
      url: '/parent',
      type: 'notify_parent'
    });
    notify(`Asked your parent for ${what} 🎉`);
    setMoneyAmount("");
    setMoneyDest(null);
    fetchRequests();
  }

  function requestLabel(r) {
    if (r.wallet === 'screen_time') return `⏰ ${r.amount} min screen time`;
    if (r.wallet === 'playstation_time') return `🎮 ${r.amount} min PlayStation`;
    return `💰 ${r.amount} ${rateFor('money')?.unit_label || ''} → ${r.money_destinations?.name || ''}`;
  }

  function requestStatus(r) {
    if (r.status === 'pending') return { text: 'Waiting for parent 👀', kind: 'wait' };
    if (r.familylink_ends_at && new Date(r.familylink_ends_at) > new Date()) {
      return { text: `On now, until ${timeInRiyadh(r.familylink_ends_at)} ▶`, kind: 'ok' };
    }
    if (r.wallet === 'screen_time') return { text: 'Approved! Your parent is adding it ✅', kind: 'ok' };
    if (r.wallet === 'playstation_time') return { text: 'Approved! Being added to your PlayStation ✅', kind: 'ok' };
    return { text: 'Approved! Coming soon ✅', kind: 'ok' };
  }

  const moneyValue = parseFloat(moneyAmount);
  const moneyCost = moneyValue > 0 ? costOf('money', moneyValue) : 0;

  return (
    <div className="app-wrapper">
      {noticeElement}
      <div className="content-area">
        <div className="top-bar">
          <h1>Hi, {user?.name}! 👋</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {isPushSupported && !pushEnabled && (
              <button
                className="link-button"
                style={{ fontSize: "1.4rem", animation: "pulse 2s infinite" }}
                onClick={async () => {
                  if (await requestPushPermission(kidId)) setPushEnabled(true);
                }}
              >
                🔔
              </button>
            )}
            <button className="link-button" onClick={() => logout(nav)}>Log out</button>
          </div>
        </div>

        <div className="card balance-card">
          <h2>Your Points</h2>
          <div className="balance-amount">{points} ⭐</div>
        </div>

        {activeTab === "today" && (
          <div>
            <h2 className="section-title">Today's Quests 🎯</h2>

            {tasks.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <span style={{ fontSize: "3rem" }}>🌴</span>
                <h3>No tasks right now!</h3>
              </div>
            )}

            {tasks.map(t => {
              const reward = Number(t.tasks?.reward || 0);
              return (
                <div key={t.id} className="card">
                  <div className="row">
                    <h3 style={{ margin: 0, fontSize: "1.2rem", flex: 1 }}>{t.tasks?.title?.replace(EXCEPTIONAL, '')}</h3>
                    <span className="pill">{reward > 0 ? '+' : ''}{reward} ⭐</span>
                  </div>

                  {t.status === "pending" && (
                    <button className="button button-green" onClick={() => markDone(t.id, t.tasks?.title)}>
                      Done ✅
                    </button>
                  )}
                  {t.status === "waiting_parent" && <div className="status-line wait">Waiting for parent 👀</div>}
                  {t.status === "approved" && <div className="status-line ok">{reward >= 0 ? 'Points added! 🎉' : 'Points taken'}</div>}
                  {t.status === "completed" && <div className="status-line">Done (no points)</div>}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "rewards" && (
          <div>
            {requests.length > 0 && (
              <>
                <h2 className="section-title">My Requests</h2>
                {requests.map(r => {
                  const s = requestStatus(r);
                  return (
                    <div key={r.id} className="card">
                      <div className="row">
                        <strong>{requestLabel(r)}</strong>
                        <span className="pill">{r.points_cost} ⭐</span>
                      </div>
                      <div className={`status-line ${s.kind}`}>{s.text}</div>
                    </div>
                  );
                })}
              </>
            )}

            <h2 className="section-title">⏰ Screen Time</h2>
            <div className="card">
              <p className="muted">Tap to ask your parent. The time starts as soon as they say yes.</p>
              <div className="button-grid">
                {SCREEN_MINUTES.map(min => {
                  const cost = costOf('screen_time', min);
                  return (
                    <button
                      key={min}
                      className="button button-info"
                      style={{ padding: "14px 6px", fontSize: "1rem", textTransform: "none" }}
                      disabled={sending || !rateFor('screen_time') || cost > available}
                      onClick={() => ask('screen_time', min)}
                    >
                      {min} min<br /><span style={{ fontSize: "0.85rem" }}>{cost} ⭐</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {rateFor('playstation_time') && (
              <>
                <h2 className="section-title">🎮 PlayStation</h2>
                <div className="card">
                  <p className="muted">Tap to ask your parent. Once they say yes, you can play it any time today.</p>
                  <div className="button-grid">
                    {PLAYSTATION_MINUTES.map(min => {
                      const cost = costOf('playstation_time', min);
                      return (
                        <button
                          key={min}
                          className="button button-info"
                          style={{ padding: "14px 6px", fontSize: "1rem", textTransform: "none" }}
                          disabled={sending || cost > available}
                          onClick={() => ask('playstation_time', min)}
                        >
                          {min} min<br /><span style={{ fontSize: "0.85rem" }}>{cost} ⭐</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {destinations.length > 0 && (
              <>
                <h2 className="section-title">💰 Money</h2>
                <div className="card">
                  <p className="muted">
                    {rateFor('money')?.points_per_unit} ⭐ = 1 {rateFor('money')?.unit_label}. Where should it go?
                  </p>
                  <div className="chips">
                    {destinations.map(d => (
                      <button
                        key={d.id}
                        className={`chip ${moneyDest?.id === d.id ? 'selected' : ''}`}
                        onClick={() => setMoneyDest(d)}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  {moneyDest && (
                    <>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min="1"
                        placeholder={`How much ${rateFor('money')?.unit_label}?`}
                        value={moneyAmount}
                        onChange={e => setMoneyAmount(e.target.value)}
                      />
                      <button
                        className="button button-info"
                        disabled={sending || !(moneyValue > 0) || moneyCost > available}
                        onClick={() => ask('money', moneyValue, moneyDest)}
                      >
                        {moneyCost > available ? 'Not enough points' : `Ask${moneyValue > 0 ? ` · ${moneyCost} ⭐` : ''}`}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="bottom-nav">
        <div className={`nav-item ${activeTab === 'today' ? 'active' : ''}`} onClick={() => { setActiveTab('today'); fetchTasks(); }}>
          <span className="nav-icon">✨</span>
          <span>Today</span>
        </div>
        <div className={`nav-item ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => { setActiveTab('rewards'); fetchPoints(); fetchRequests(); }}>
          <span className="nav-icon">🎁</span>
          <span>Rewards</span>
        </div>
      </div>
    </div>
  );
}
