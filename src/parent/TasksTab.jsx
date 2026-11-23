import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const REPEATS = [['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']];
const repeatLabel = Object.fromEntries(REPEATS);

const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Today in Riyadh, matching api/cron-tasks.js: the YYYY-MM-DD date, the lowercase
// weekday name, and the day of month, all evaluated in Asia/Riyadh.
function riyadhToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        dayName: (get('weekday') || '').toLowerCase(),
        dom: Number(get('day')),
    };
}

// Whether a task's recurrence means it runs today (same rule as the nightly cron).
function occursToday(task, today) {
    if (task.recurrence === 'daily') return true;
    if (task.recurrence === 'weekly') return task.week_day === today.dayName;
    if (task.recurrence === 'monthly') return task.month_day === today.dom;
    return false;
}

export default function TasksTab({ notify, refreshKey }) {
    const [tasks, setTasks] = useState([]);
    const [kids, setKids] = useState([]);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    useEffect(() => {
        load();
    }, [refreshKey]);

    async function load() {
        // Production's tasks table has no FK to users and predates created_at, so names are looked
        // up and the list is sorted here rather than in the query.
        const [{ data: kidRows }, { data: taskRows, error }] = await Promise.all([
            supabase.from('users').select('id, name').eq('role', 'kid').order('name'),
            supabase.from('tasks').select('*'),
        ]);
        if (error) console.error("Error fetching tasks:", error);
        setKids(kidRows || []);
        // One-off rows are the reasons behind +/− points, not real tasks.
        setTasks((taskRows || [])
            .filter(t => t.recurrence !== 'once')
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
    }

    function newTask() {
        setForm({ title: "", reward: "5", kidId: kids[0]?.id, recurrence: 'daily', prayer: false });
    }

    async function save() {
        if (!form.title.trim() || !(parseInt(form.reward, 10) > 0) || !form.kidId) {
            notify("Add a name and the points for this task.", 'error');
            return;
        }
        setSaving(true);
        const { data: task, error } = await supabase.from('tasks').insert({
            title: form.title.trim(),
            reward: parseInt(form.reward, 10),
            // 'prayer' tasks get the prayer-time reminders (api/trigger_prayer_reminders.js)
            task_type: form.prayer ? 'prayer' : 'general',
            recurrence: form.recurrence,
            assigned_kid: form.kidId,
            active: true
        }).select('id, recurrence, week_day, month_day, assigned_kid').single();

        // Create today's occurrence right away if the task runs today, so the kid sees it now
        // instead of waiting for the nightly cron. Not fatal if it fails — the cron still catches it.
        let showsToday = false;
        if (!error && task) {
            const today = riyadhToday();
            if (occursToday(task, today)) {
                const { error: occErr } = await supabase.from('task_occurrences').insert({
                    task_id: task.id, kid_id: task.assigned_kid, scheduled_date: today.date, status: 'pending',
                });
                // A duplicate (the cron already made it) is fine; anything else we ignore and let the cron handle.
                showsToday = !occErr || /duplicate|unique/i.test(occErr.message || '');
            }
        }
        setSaving(false);
        if (error) {
            notify("Couldn't save: " + error.message, 'error');
            return;
        }
        const kidName = kids.find((k) => k.id === form.kidId)?.name;
        notify(`Added "${form.title.trim()}" ✅ ` +
            (showsToday ? `It shows for ${kidName || 'them'} today.` : 'It shows up from tomorrow.'));
        setForm(null);
        load();
    }

    async function toggleActive(task) {
        await supabase.from('tasks').update({ active: !task.active }).eq('id', task.id);
        load();
    }

    async function remove(task) {
        await supabase.from('tasks').delete().eq('id', task.id);
        setConfirmDelete(null);
        notify(`Deleted "${task.title}"`);
        load();
    }

    return (
        <div>
            {form ? (
                <div className="card">
                    <h3 style={{ margin: 0 }}>New task</h3>
                    <input className="input" placeholder="What to do? e.g. Make your bed" value={form.title}
                        onChange={e => setForm({ ...form, title: e.target.value })} />
                    <div className="row">
                        <span className="muted">Points</span>
                        <input className="input" style={{ width: "100px" }} type="number" inputMode="numeric" min="1"
                            value={form.reward} onChange={e => setForm({ ...form, reward: e.target.value })} />
                    </div>
                    <span className="muted">For</span>
                    <div className="chips">
                        {kids.map(k => (
                            <button key={k.id} className={`chip ${form.kidId === k.id ? 'selected' : ''}`} onClick={() => setForm({ ...form, kidId: k.id })}>
                                {k.name}
                            </button>
                        ))}
                    </div>
                    <span className="muted">Repeat</span>
                    <div className="chips">
                        {REPEATS.map(([value, label]) => (
                            <button key={value} className={`chip ${form.recurrence === value ? 'selected' : ''}`} onClick={() => setForm({ ...form, recurrence: value })}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="chips">
                        <button className={`chip ${form.prayer ? 'selected' : ''}`} onClick={() => setForm({ ...form, prayer: !form.prayer })}>
                            🕌 Prayer (send prayer reminders)
                        </button>
                    </div>
                    <div className="row">
                        <button className="button button-green button-small" style={{ flex: 1 }} disabled={saving} onClick={save}>
                            {saving ? 'Saving…' : 'Add task'}
                        </button>
                        <button className="button button-ghost button-small" onClick={() => setForm(null)}>Cancel</button>
                    </div>
                </div>
            ) : (
                <button className="button button-info" style={{ width: "100%", marginBottom: "20px" }} onClick={newTask}>
                    + New task
                </button>
            )}

            {kids.map(kid => {
                const kidTasks = tasks.filter(t => t.assigned_kid === kid.id);
                if (kidTasks.length === 0) return null;
                return (
                    <div key={kid.id}>
                        <h2 className="section-title">{kid.name}</h2>
                        {kidTasks.map(t => (
                            <div key={t.id} className="card" style={{ opacity: t.active ? 1 : 0.6 }}>
                                <div className="row">
                                    <strong>{t.task_type === 'prayer' ? '🕌 ' : ''}{t.title}</strong>
                                    <span className="pill">{t.reward} ⭐</span>
                                </div>
                                <p className="muted">{repeatLabel[t.recurrence] || t.recurrence}{t.active ? '' : ' · paused'}</p>
                                {confirmDelete === t.id ? (
                                    <div className="row">
                                        <span className="muted">Delete this task?</span>
                                        <button className="button button-small" onClick={() => remove(t)}>Delete</button>
                                        <button className="button button-ghost button-small" onClick={() => setConfirmDelete(null)}>Keep</button>
                                    </div>
                                ) : (
                                    <div className="row">
                                        <button className="button button-ghost button-small" style={{ flex: 1 }} onClick={() => toggleActive(t)}>
                                            {t.active ? 'Pause' : 'Resume'}
                                        </button>
                                        <button className="button button-ghost button-small" onClick={() => setConfirmDelete(t.id)}>Delete</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
