import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { sendNotification } from "../pushManager";
import { callFamilyLink } from "../familyLink";
import { callPlayStation } from "../playStation";
import { todayInRiyadh, timeInRiyadh } from "../notice";

const daysAgoInRiyadh = (days) =>
    new Date(Date.now() - days * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

// Everything waiting for a parent from the last week: finished tasks, new requests, and approved
// requests that still need a real-world action (money to hand over, screen time that didn't start).
export default function ApproveTab({ user, notify, onCount, refreshKey }) {
    const [names, setNames] = useState({});
    const [points, setPoints] = useState({});
    const [doneTasks, setDoneTasks] = useState([]);
    const [requests, setRequests] = useState([]);
    const [toDo, setToDo] = useState([]);
    const [unit, setUnit] = useState("");
    const [busy, setBusy] = useState(null);
    const [confirmRefund, setConfirmRefund] = useState(null);

    useEffect(() => {
        load();
    }, [refreshKey]);

    async function load() {
        const [{ data: users }, { data: tx }, { data: occ }, { data: reqs }, { data: rate }] = await Promise.all([
            supabase.from('users').select('id, name'),
            supabase.from('wallet_transactions').select('kid_id, amount').eq('wallet', 'points'),
            supabase
                .from('task_occurrences')
                .select('id, kid_id, scheduled_date, tasks:task_id (title, reward, assigned_kid)')
                .eq('status', 'waiting_parent')
                // Only the last week: older unapproved tasks are stale, and "Approve all" would pay them out.
                .gte('scheduled_date', daysAgoInRiyadh(6))
                .order('scheduled_date'),
            supabase
                .from('wallet_requests')
                .select('*, money_destinations(name)')
                .in('status', ['pending', 'approved'])
                .order('created_at'),
            supabase.from('wallet_rates').select('unit_label').eq('wallet', 'money').maybeSingle(),
        ]);

        const nameMap = {};
        users?.forEach(u => { nameMap[u.id] = u.name; });
        const pointMap = {};
        tx?.forEach(t => { pointMap[t.kid_id] = (pointMap[t.kid_id] || 0) + Number(t.amount); });

        const pending = (reqs || []).filter(r => r.status === 'pending');
        const approved = (reqs || []).filter(r => r.status === 'approved');
        setNames(nameMap);
        setPoints(pointMap);
        setDoneTasks((occ || []).map(o => ({ ...o, kid_id: o.kid_id || o.tasks?.assigned_kid })));
        setRequests(pending);
        setToDo(approved);
        setUnit(rate?.unit_label || "");
        onCount?.((occ?.length || 0) + pending.length + approved.length);
    }

    async function approveTask(task) {
        setBusy(task.id);
        // Only the call that actually moves it out of waiting_parent pays out, so a double tap can't pay twice.
        const { data: claimed } = await supabase
            .from('task_occurrences')
            .update({ status: 'approved', updated_by_name: user?.name || "Parent" })
            .eq('id', task.id)
            .eq('status', 'waiting_parent')
            .select('id');

        if (claimed?.length) {
            await supabase.from('wallet_transactions').insert({
                kid_id: task.kid_id,
                wallet: 'points',
                amount: task.tasks?.reward,
                type: 'reward',
                occurrence_id: task.id,
            });
            sendNotification({
                title: 'Task Approved! 🌟',
                message: `"${task.tasks?.title}" approved: +${task.tasks?.reward} ⭐`,
                targetKidId: task.kid_id,
                url: '/kid',
                type: 'notify_kid'
            });
        }
        setBusy(null);
        load();
    }

    async function approveAll() {
        for (const task of doneTasks) await approveTask(task);
        notify(`Approved ${doneTasks.length} tasks ✅`);
    }

    async function sendBack(task) {
        setBusy(task.id);
        await supabase
            .from('task_occurrences')
            .update({ status: 'pending', completed_at: null, updated_by_name: user?.name || "Parent" })
            .eq('id', task.id)
            .eq('status', 'waiting_parent');
        setBusy(null);
        load();
    }

    async function approveRequest(r) {
        const kidPoints = points[r.kid_id] || 0;
        if (kidPoints < Number(r.points_cost)) {
            notify(`${names[r.kid_id]} has ${kidPoints} ⭐ but this needs ${r.points_cost} ⭐.`, 'error');
            return;
        }
        setBusy(r.id);

        // Only the call that actually moves it out of 'pending' deducts points.
        const { data: claimed } = await supabase
            .from('wallet_requests')
            .update(r.wallet === 'screen_time' ? { status: 'approved', familylink_status: 'ready' } : { status: 'approved' })
            .eq('id', r.id)
            .eq('status', 'pending')
            .select('id');

        if (claimed?.length) {
            await supabase.from('wallet_transactions').insert({
                kid_id: r.kid_id,
                wallet: 'points',
                amount: -r.points_cost,
                type: 'withdraw',
                request_id: r.id
            });

            if (r.wallet === 'screen_time') {
                // The time starts now: a Family Link bonus runs from the moment it's applied.
                await startScreenTime(r);
            } else if (r.wallet === 'playstation_time') {
                await addPlayStationTime(r);
            } else {
                sendNotification({
                    title: 'Request Approved! 🎉',
                    message: `${r.amount} ${unit} to ${r.money_destinations?.name} is approved!`,
                    targetKidId: r.kid_id,
                    url: '/kid',
                    type: 'notify_kid'
                });
                notify(`Approved. Remember to give ${names[r.kid_id]} ${r.amount} ${unit} 💰`);
            }
        }
        setBusy(null);
        load();
    }

    async function startScreenTime(r) {
        setBusy(r.id);
        try {
            const result = await callFamilyLink('start', { requestId: r.id });
            if (result.status === 'granted') {
                notify(`Added ${r.amount} min to ${names[r.kid_id]}'s phone, until ${timeInRiyadh(result.endsAt)} ✅`);
            } else {
                notify(result.error || "Couldn't add the time on Family Link.", 'error');
            }
        } catch (e) {
            notify(e.message, 'error');
        }
        setBusy(null);
        load();
    }

    // Adds the minutes to the kid's PlayStation limit for today (playable any time until midnight).
    async function addPlayStationTime(r) {
        setBusy(r.id);
        try {
            const result = await callPlayStation('grant', { requestId: r.id });
            if (result.status === 'granted') {
                notify(`Added ${r.amount} min to ${names[r.kid_id]}'s PlayStation for today (${result.todayLimitMinutes} min in total) 🎮`);
            } else {
                notify(result.error || "Couldn't add the time on PlayStation.", 'error');
            }
        } catch (e) {
            notify(e.message, 'error');
        }
        setBusy(null);
        load();
    }

    async function rejectRequest(r) {
        setBusy(r.id);
        await supabase.from('wallet_requests').update({ status: 'rejected' }).eq('id', r.id).eq('status', 'pending');
        sendNotification({
            title: 'Request not approved',
            message: `Your request for ${describe(r)} wasn't approved this time.`,
            targetKidId: r.kid_id,
            url: '/kid',
            type: 'notify_kid'
        });
        setBusy(null);
        load();
    }

    // Gives the points back for an approved request whose real-world action never happened (for
    // example PlayStation or Family Link refused the time). Only a request that is still 'approved'
    // and not mid-grant can be claimed, so this can't refund twice or race a grant that is running.
    async function refundRequest(r) {
        setConfirmRefund(null);
        setBusy(r.id);
        const grantColumn = { screen_time: 'familylink_status', playstation_time: 'playstation_status' }[r.wallet];
        let claim = supabase
            .from('wallet_requests')
            .update({ status: 'rejected' })
            .eq('id', r.id)
            .eq('status', 'approved');
        if (grantColumn) claim = claim.or(`${grantColumn}.is.null,${grantColumn}.neq.granting`);
        const { data: claimed, error: claimError } = await claim.select('id');

        if (claimError || !claimed?.length) {
            notify(claimError?.message || "This can't be refunded right now: the time may be being added. Try again in a moment.", 'error');
        } else {
            const { error } = await supabase.from('wallet_transactions').insert({
                kid_id: r.kid_id,
                wallet: 'points',
                amount: Number(r.points_cost),
                type: 'reward',
                request_id: r.id,
            });
            if (error) {
                // Put the request back so the points aren't lost and the parent can try again.
                await supabase.from('wallet_requests').update({ status: 'approved' }).eq('id', r.id).eq('status', 'rejected');
                notify(`Couldn't give the points back: ${error.message}`, 'error');
            } else {
                sendNotification({
                    title: 'Points returned ↩️',
                    message: `Your ${describe(r)} couldn't be given, so your ${r.points_cost} ⭐ are back.`,
                    targetKidId: r.kid_id,
                    url: '/kid',
                    type: 'notify_kid'
                });
                notify(`Gave ${names[r.kid_id]} back ${r.points_cost} ⭐ ↩️`);
            }
        }
        setBusy(null);
        load();
    }

    async function markGiven(r) {
        setBusy(r.id);
        await supabase
            .from('wallet_requests')
            .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by_name: user?.name || "Parent" })
            .eq('id', r.id);
        setBusy(null);
        load();
    }

    const describe = (r) => r.wallet === 'screen_time'
        ? `${r.amount} min screen time`
        : r.wallet === 'playstation_time'
            ? `${r.amount} min PlayStation`
            : `${r.amount} ${unit} → ${r.money_destinations?.name}`;
    const icon = (r) => ({ screen_time: '⏰', playstation_time: '🎮' })[r.wallet] || '💰';
    const approveHint = (r) => ({
        screen_time: ' · starts as soon as you approve',
        playstation_time: " · added to today's PlayStation time when you approve",
    })[r.wallet] || '';

    const today = todayInRiyadh();
    const nothing = doneTasks.length + requests.length + toDo.length === 0;

    return (
        <div>
            {nothing && (
                <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
                    <span style={{ fontSize: "3rem" }}>🎉</span>
                    <h3>All caught up!</h3>
                    <p>Nothing is waiting for you.</p>
                </div>
            )}

            {requests.length > 0 && (
                <>
                    <h2 className="section-title">Requests</h2>
                    {requests.map(r => (
                        <div key={r.id} className="card">
                            <div className="row">
                                <strong>{names[r.kid_id]} · {icon(r)} {describe(r)}</strong>
                                <span className="pill">{r.points_cost} ⭐</span>
                            </div>
                            <p className="muted">
                                Has {points[r.kid_id] || 0} ⭐{approveHint(r)}
                            </p>
                            <div className="row">
                                <button className="button button-green button-small" style={{ flex: 1 }} disabled={busy === r.id} onClick={() => approveRequest(r)}>
                                    {busy === r.id ? 'Working…' : 'Approve ✓'}
                                </button>
                                <button className="button button-ghost button-small" disabled={busy === r.id} onClick={() => rejectRequest(r)}>
                                    No
                                </button>
                            </div>
                        </div>
                    ))}
                </>
            )}

            {doneTasks.length > 0 && (
                <>
                    <div className="row section-title">
                        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Tasks done</h2>
                        {doneTasks.length > 1 && (
                            <button className="button button-green button-small" disabled={!!busy} onClick={approveAll}>
                                Approve all ({doneTasks.length})
                            </button>
                        )}
                    </div>
                    {doneTasks.map(t => (
                        <div key={t.id} className="card">
                            <div className="row">
                                <strong>{names[t.kid_id] || 'Unknown'} · {t.tasks?.title}</strong>
                                <span className="pill">+{t.tasks?.reward} ⭐</span>
                            </div>
                            {t.scheduled_date !== today && <p className="muted">From {t.scheduled_date}</p>}
                            <div className="row">
                                <button className="button button-green button-small" style={{ flex: 1 }} disabled={busy === t.id} onClick={() => approveTask(t)}>
                                    Approve ✓
                                </button>
                                <button className="button button-ghost button-small" disabled={busy === t.id} onClick={() => sendBack(t)}>
                                    Not done
                                </button>
                            </div>
                        </div>
                    ))}
                </>
            )}

            {toDo.length > 0 && (
                <>
                    <h2 className="section-title">Still to do</h2>
                    {toDo.map(r => (
                        <div key={r.id} className="card">
                            <strong>
                                {r.wallet === 'money'
                                    ? `💰 Give ${names[r.kid_id]} ${r.amount} ${unit} (${r.money_destinations?.name})`
                                    : r.wallet === 'playstation_time'
                                        ? `🎮 ${names[r.kid_id]}'s ${r.amount} min PlayStation`
                                        : `⏰ ${names[r.kid_id]}'s ${r.amount} min screen time`}
                            </strong>
                            {r.wallet === 'playstation_time' && r.playstation_status === 'failed' && (
                                <div className="status-line error">{r.playstation_error}</div>
                            )}
                            {r.wallet === 'playstation_time' && r.playstation_status !== 'failed' && (
                                <p className="muted">Not added to the PlayStation yet.</p>
                            )}
                            {r.wallet === 'screen_time' && r.familylink_status === 'failed' && (
                                <div className="status-line error">{r.familylink_error}</div>
                            )}
                            {r.wallet === 'screen_time' && r.familylink_status !== 'failed' && (
                                <p className="muted">Not added to the phone yet.</p>
                            )}
                            <div className="row">
                                {r.wallet === 'screen_time' && (
                                    <button
                                        className="button button-info button-small"
                                        style={{ flex: 1 }}
                                        disabled={busy === r.id || r.familylink_status === 'granting'}
                                        onClick={() => startScreenTime(r)}
                                    >
                                        {busy === r.id || r.familylink_status === 'granting' ? 'Adding…' : 'Add to phone now'}
                                    </button>
                                )}
                                {r.wallet === 'playstation_time' && (
                                    <button
                                        className="button button-info button-small"
                                        style={{ flex: 1 }}
                                        disabled={busy === r.id || r.playstation_status === 'granting'}
                                        onClick={() => addPlayStationTime(r)}
                                    >
                                        {busy === r.id || r.playstation_status === 'granting' ? 'Adding…' : 'Add to PlayStation now'}
                                    </button>
                                )}
                                <button className="button button-ghost button-small" style={r.wallet === 'money' ? { flex: 1 } : {}} disabled={busy === r.id} onClick={() => markGiven(r)}>
                                    {r.wallet === 'money' ? 'Done, I gave it ✓' : 'I did it myself ✓'}
                                </button>
                            </div>
                            {confirmRefund === r.id ? (
                                <div className="row" style={{ marginTop: 8 }}>
                                    <span className="muted">Cancel and give back {r.points_cost} ⭐?</span>
                                    <button className="button button-small" disabled={busy === r.id} onClick={() => refundRequest(r)}>Give back</button>
                                    <button className="button button-ghost button-small" onClick={() => setConfirmRefund(null)}>Keep</button>
                                </div>
                            ) : (
                                <button
                                    className="button button-ghost button-small"
                                    style={{ width: "100%", marginTop: 8 }}
                                    disabled={busy === r.id || r.familylink_status === 'granting' || r.playstation_status === 'granting'}
                                    onClick={() => setConfirmRefund(r.id)}
                                >
                                    Cancel &amp; give back {r.points_cost} ⭐
                                </button>
                            )}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
