import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import FamilyLinkSettings from "./FamilyLinkSettings";
import PlayStationSettings from "./PlayStationSettings";

export default function SettingsTab({ notify }) {
    const [rates, setRates] = useState([]);
    const [destinations, setDestinations] = useState([]);
    const [newDestName, setNewDestName] = useState("");

    useEffect(() => {
        fetchRates();
        fetchDestinations();
    }, []);

    async function fetchRates() {
        const { data } = await supabase.from('wallet_rates').select('*').order('wallet');
        setRates(data || []);
    }

    async function fetchDestinations() {
        const { data } = await supabase.from('money_destinations').select('*').order('created_at');
        setDestinations(data || []);
    }

    async function updateRate(wallet, patch) {
        if ('points_per_unit' in patch && !(patch.points_per_unit > 0)) return;
        const { error } = await supabase.from('wallet_rates').update(patch).eq('wallet', wallet);
        if (error) notify("Couldn't save: " + error.message, 'error');
        else notify("Saved ✅");
        fetchRates();
    }

    async function addDestination() {
        if (!newDestName.trim()) return;
        const { error } = await supabase.from('money_destinations').insert({ name: newDestName.trim() });
        if (error) notify("Couldn't add: " + error.message, 'error');
        else setNewDestName("");
        fetchDestinations();
    }

    async function toggleDestination(d) {
        await supabase.from('money_destinations').update({ active: !d.active }).eq('id', d.id);
        fetchDestinations();
    }

    const screen = rates.find(r => r.wallet === 'screen_time');
    const money = rates.find(r => r.wallet === 'money');
    const playstation = rates.find(r => r.wallet === 'playstation_time');

    return (
        <div>
            <h2 className="section-title">Prices ⭐</h2>
            <div className="card">
                {screen && (
                    <div className="row">
                        <span>⏰ 1 minute costs</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input key={screen.points_per_unit} className="input" style={{ width: "80px" }} type="number" inputMode="decimal"
                                defaultValue={screen.points_per_unit}
                                onBlur={e => Number(e.target.value) !== Number(screen.points_per_unit) && updateRate('screen_time', { points_per_unit: parseFloat(e.target.value) })} />
                            ⭐
                        </span>
                    </div>
                )}
                {playstation && (
                    <div className="row">
                        <span>🎮 1 PlayStation minute costs</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input key={playstation.points_per_unit} className="input" style={{ width: "80px" }} type="number" inputMode="decimal"
                                defaultValue={playstation.points_per_unit}
                                onBlur={e => Number(e.target.value) !== Number(playstation.points_per_unit) && updateRate('playstation_time', { points_per_unit: parseFloat(e.target.value) })} />
                            ⭐
                        </span>
                    </div>
                )}
                {money && (
                    <div className="row">
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            💰 1
                            <input key={money.unit_label} className="input" style={{ width: "70px" }} defaultValue={money.unit_label}
                                onBlur={e => e.target.value.trim() && e.target.value !== money.unit_label && updateRate('money', { unit_label: e.target.value.trim() })} />
                            costs
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input key={money.points_per_unit} className="input" style={{ width: "80px" }} type="number" inputMode="decimal"
                                defaultValue={money.points_per_unit}
                                onBlur={e => Number(e.target.value) !== Number(money.points_per_unit) && updateRate('money', { points_per_unit: parseFloat(e.target.value) })} />
                            ⭐
                        </span>
                    </div>
                )}
            </div>

            <h2 className="section-title">Where money can go 💵</h2>
            <div className="card">
                <p className="muted">Tap one to hide or show it for the kids.</p>
                <div className="chips">
                    {destinations.map(d => (
                        <button key={d.id} className={`chip ${d.active ? 'selected' : ''}`} onClick={() => toggleDestination(d)}>
                            {d.active ? '✓ ' : ''}{d.name}
                        </button>
                    ))}
                </div>
                <div className="row">
                    <input className="input" placeholder="Add a place, e.g. School canteen" value={newDestName}
                        onChange={e => setNewDestName(e.target.value)} />
                    <button className="button button-info button-small" onClick={addDestination}>Add</button>
                </div>
            </div>

            <FamilyLinkSettings notify={notify} />
            <PlayStationSettings notify={notify} />
        </div>
    );
}
