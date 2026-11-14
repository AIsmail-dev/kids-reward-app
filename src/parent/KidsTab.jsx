import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { sendNotification } from "../pushManager";
import { todayInRiyadh } from "../notice";

const EXCEPTIONAL = /^\[Exceptional\]\s*/;

export default function KidsTab({ user, notify, refreshKey }) {
    const [kids, setKids] = useState([]);
    const [points, setPoints] = useState({});
    const [todayTasks, setTodayTasks] = useState({});
    const [form, setForm] = useState(null); // { kidId, sign: 1 | -1, amount, reason }
    const [historyFor, setHistoryFor] = useState(null);
    const [history, setHistory] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        load();
    }, [refreshKey]);

    async function load() {
        const [{ data: kidRows }, { data: tx }, { data: occ }] = await Promise.all([
            supabase.from('users').select('id, name').eq('role', 'kid').order('name'),
            supabase.from('wallet_transactions').select('kid_id, amount').eq('wallet', 'points'),
            supabase
                .from('task_occurrences')
                .select('id, kid_id, status, tasks:task_id (title, reward, assigned_kid, recurrence)')
                .eq('scheduled_date', todayInRiyadh()),
        ]);
        const pointMap = {};
        tx?.forEach(t => { pointMap[t.kid_id] = (pointMap[t.kid_id] || 0) + Number(t.amount); });
        const taskMap = {};
        (occ || [])
            .filter(o => o.tasks?.recurrence !== 'once')
            .forEach(o => {
                const kidId = o.kid_id || o.tasks?.assigned_kid;
                (taskMap[kidId] = taskMap[kidId] || []).push({ ...o, kid_id: kidId });
            });
        setKids(kidRows || []);
        setPoints(pointMap);
        setTodayTasks(taskMap);
    }

    // For a task the kid did but didn't tap Done on: approve and pay straight away.
    async function markDone(task) {
        const { data: claimed } = await supabase
            .from('task_occurrences')
            .update({ status: 'approved', completed_at: new Date().toISOString(), updated_by_name: user?.name || "Parent" })
            .eq('id', task.id)
            .in('status', ['pending', 'waiting_parent'])
            .select('id');
        if (claimed?.length) {
            await supabase.from('wallet_transactions').insert({
                kid_id: task.kid_id, wallet: 'points', amount: task.tasks?.reward, type: 'reward', occurrence_id: task.id,
            });
            notify(`"${task.tasks?.title}" done: +${task.tasks?.reward} ⭐`);
        }
        load();
    }

    async function savePoints() {
        const value = parseInt(form.amount, 10);
        if (!(value > 0)) {
            notify("Enter how many points.", 'error');
            return;
        }
        if (!form.reason.trim()) {
            notify("Add a short reason, so they know why.", 'error');
            return;
        }
        setSaving(true);
        const amount = form.sign * value;

        // The reason is kept as a one-off task with an approved occurrence, so it shows in history.
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .insert({ title: `[Exceptional] ${form.reason.trim()}`, reward: amount, recurrence: 'once', assigned_kid: form.kidId, active: false })
            .select('id')
            .single();
        const { data: occ, error: occError } = taskError ? {} : await supabase
            .from('task_occurrences')
            .insert({ task_id: task.id, kid_id: form.kidId, scheduled_date: todayInRiyadh(), status: 'approved', updated_by_name: user?.name || "Parent" })
            .select('id')
            .single();
        const { error: txError } = taskError || occError ? {} : await supabase
            .from('wallet_transactions')
            .insert({ kid_id: form.kidId, wallet: 'points', amount, type: amount > 0 ? 'reward' : 'withdraw', occurrence_id: occ.id });
        setSaving(false);

        const error = taskError || occError || txError;
        if (error) {
            notify("Couldn't save: " + error.message, 'error');
            return;
        }
        const kidName = kids.find(k => k.id === form.kidId)?.name;
        sendNotification({
            title: amount > 0 ? 'Bonus points! 🎁' : 'Points taken',
            message: `${amount > 0 ? '+' : ''}${amount} ⭐: ${form.reason.trim()}`,
            targetKidId: form.kidId,
            url: '/kid',
            type: 'notify_kid'
        });
        notify(`${amount > 0 ? 'Added' : 'Took'} ${value} ⭐ ${amount > 0 ? 'to' : 'from'} ${kidName}`);
        setForm(null);
        load();
        if (historyFor === form.kidId) loadHistory(form.kidId);
    }

    async function loadHistory(kidId) {
        setHistoryFor(kidId);
        const { data: tx } = await supabase
            .from('wallet_transactions')
            .select('id, amount, type, created_at, occurrence_id, request_id')
            .eq('kid_id', kidId)
            .eq('wallet', 'points')
            .order('created_at', { ascending: false })
            .limit(25);
        const occIds = (tx || []).map(t => t.occurrence_id).filter(Boolean);
        const reqIds = (tx || []).map(t => t.request_id).filter(Boolean);
        const [{ data: occ }, { data: reqs }] = await Promise.all([
            occIds.length ? supabase.from('task_occurrences').select('id, tasks:task_id (title)').in('id', occIds) : { data: [] },
            reqIds.length ? supabase.from('wallet_requests').select('id, wallet, amount, money_destinations(name)').in('id', reqIds) : { data: [] },
        ]);
        const occTitle = Object.fromEntries((occ || []).map(o => [o.id, o.tasks?.title?.replace(EXCEPTIONAL, '')]));
        const reqLabel = Object.fromEntries((reqs || []).map(r => [r.id,
            r.wallet === 'screen_time' ? `⏰ ${r.amount} min screen time` : `💰 ${r.amount} → ${r.money_destinations?.name}`]));
        setHistory((tx || []).map(t => ({
            ...t,
            label: occTitle[t.occurrence_id] || reqLabel[t.request_id]
                || (t.type === 'convert' ? 'Moved from old wallets' : t.type === 'reward' ? 'Task reward' : 'Spent'),
        })));
    }

    const statusIcon = { pending: '⬜', waiting_parent: '👀', approved: '✅', completed: '☑️' };

    return (
        <div>
            {kids.map(kid => {
                const tasks = todayTasks[kid.id] || [];
                const done = tasks.filter(t => t.status === 'approved' || t.status === 'completed').length;
                return (
                    <div key={kid.id} className="card">
                        <div className="row">
                            <h3 style={{ margin: 0 }}>{kid.name}</h3>
                            <span className="pill">{points[kid.id] || 0} ⭐</span>
                        </div>
                        <p className="muted">Today: {done} of {tasks.length} tasks done</p>

                        {tasks.map(t => (
                            <div key={t.id} className="row" style={{ padding: "4px 0" }}>
                                <span>{statusIcon[t.status] || '⬜'} {t.tasks?.title}</span>
                                {(t.status === 'pending' || t.status === 'waiting_parent') && (
                                    <button className="button button-ghost button-small" onClick={() => markDone(t)}>
                                        Mark done
                                    </button>
                                )}
                            </div>
                        ))}

                        {form?.kidId === kid.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                                <strong>{form.sign > 0 ? 'Give points' : 'Take points'}</strong>
                                <input className="input" type="number" inputMode="numeric" min="1" placeholder="Points"
                                    value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                                <input className="input" placeholder={form.sign > 0 ? 'Why? e.g. Helped his sister' : 'Why?'}
                                    value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                                <div className="row">
                                    <button className={`button button-small ${form.sign > 0 ? 'button-green' : ''}`} style={{ flex: 1 }} disabled={saving} onClick={savePoints}>
                                        {saving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button className="button button-ghost button-small" onClick={() => setForm(null)}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="row" style={{ marginTop: "8px" }}>
                                <button className="button button-green button-small" style={{ flex: 1 }} onClick={() => setForm({ kidId: kid.id, sign: 1, amount: "", reason: "" })}>
                                    + Points
                                </button>
                                <button className="button button-small" style={{ flex: 1 }} onClick={() => setForm({ kidId: kid.id, sign: -1, amount: "", reason: "" })}>
                                    − Points
                                </button>
                                <button className="button button-ghost button-small" onClick={() => historyFor === kid.id ? setHistoryFor(null) : loadHistory(kid.id)}>
                                    History
                                </button>
                            </div>
                        )}

                        {historyFor === kid.id && (
                            <div style={{ marginTop: "8px" }}>
                                {history.length === 0 && <p className="muted">Nothing yet.</p>}
                                {history.map(h => (
                                    <div key={h.id} className="row" style={{ padding: "6px 0", borderTop: "1px solid #F1F5F9" }}>
                                        <span>
                                            {h.label}
                                            <br />
                                            <span className="muted">{new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                        </span>
                                        <strong style={{ color: Number(h.amount) >= 0 ? '#16A34A' : '#DC2626' }}>
                                            {Number(h.amount) > 0 ? '+' : ''}{Number(h.amount)} ⭐
                                        </strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
