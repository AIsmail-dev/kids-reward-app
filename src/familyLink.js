// Calls to api/familylink.js with the logged-in user's JWT: the server decides what each role may do.
// Google cookies never come back here.
export async function callFamilyLink(action, body) {
    const isRead = action === 'status';
    const res = await fetch(isRead ? `/api/familylink?action=${action}` : '/api/familylink', {
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
