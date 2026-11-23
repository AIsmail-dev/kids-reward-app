// Calls to api/playstation.js with the logged-in parent's JWT. The PSN login never comes back here.
export async function callPlayStation(action, body) {
    const isRead = action === 'status';
    const res = await fetch(isRead ? `/api/playstation?action=${action}` : '/api/playstation', {
        method: isRead ? 'GET' : 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: isRead ? undefined : JSON.stringify({ action, ...body })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}
