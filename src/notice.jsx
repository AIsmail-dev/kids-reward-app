import React, { useEffect, useRef, useState } from "react";

// A short message at the top of the screen, in place of the browser's alert() pop-ups.
// Returns [element to render, show(text, kind)] where kind is 'ok' or 'error'.
export function useNotice() {
    const [notice, setNotice] = useState(null);
    const timer = useRef();

    function show(text, kind = 'ok') {
        clearTimeout(timer.current);
        setNotice({ text, kind });
        timer.current = setTimeout(() => setNotice(null), kind === 'error' ? 6000 : 3500);
    }

    const element = notice && (
        <div className={`notice ${notice.kind === 'error' ? 'notice-error' : ''}`} onClick={() => setNotice(null)}>
            {notice.text}
        </div>
    );
    return [element, show];
}

export const todayInRiyadh = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

export const timeInRiyadh = (iso) =>
    new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });

export function logout(nav) {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    nav("/login");
}

// Reloads a screen's data when the app comes back to the foreground (switching back to it,
// unlocking the phone) and when a push notification arrives or is tapped while it's open
// (public/push-sw.js posts { type: 'refresh' } to open windows).
export function useAutoRefresh(refresh) {
    const latest = useRef(refresh);
    latest.current = refresh;

    useEffect(() => {
        let last = Date.now();
        // Coming back fires several of these events at once; reload once.
        const run = () => {
            if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return;
            last = Date.now();
            latest.current();
        };
        const onMessage = (e) => { if (e.data?.type === 'refresh') { last = 0; run(); } };

        document.addEventListener('visibilitychange', run);
        window.addEventListener('focus', run);
        window.addEventListener('pageshow', run);
        navigator.serviceWorker?.addEventListener('message', onMessage);
        return () => {
            document.removeEventListener('visibilitychange', run);
            window.removeEventListener('focus', run);
            window.removeEventListener('pageshow', run);
            navigator.serviceWorker?.removeEventListener('message', onMessage);
        };
    }, []);
}
