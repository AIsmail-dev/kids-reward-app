// Tells any open app window to reload its data (src/notice.jsx useAutoRefresh).
function refreshOpenWindows() {
    return clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(list => list.forEach(client => client.postMessage({ type: 'refresh' })));
}

self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        let soundUrl = undefined;

        if (data.customSound) soundUrl = data.customSound;
        else if (data.type === 'notify_parent') soundUrl = '/notify_parent.mp3';
        else if (data.type === 'notify_kid') soundUrl = '/notify_kid.mp3';

        const options = {
            body: data.body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            sound: soundUrl,
            vibrate: data.type === 'notify_kid' ? [200, 100, 200, 100, 200, 100, 400] : [200, 100, 200],
            data: { url: data.url || '/' }
        };
        // Chrome on Android ignores `sound`. For the prayer clips the Android app plays it instead
        // (android/.../PrayerSoundDelegationService.java), picking the clip from this tag. A tag makes
        // a new notification replace the previous one, so renotify keeps the replacement audible.
        const clip = /^\/((fajr|dhuhr|asr|maghrib|isha)_(now|remind))\.mp3$/.exec(data.customSound || '');
        if (clip) {
            // data.kid: the kid's name slug, so the app can use the clip that calls them by name.
            const kid = /^[a-z0-9]+$/.test(data.kid || '') ? data.kid + '_' : '';
            options.tag = 'sound-' + kid + clip[1];
            options.renotify = true;
        }
        event.waitUntil(Promise.all([
            self.registration.showNotification(data.title, options),
            refreshOpenWindows(),
        ]));
    }
});

// Tapping a notification brings the open app to the front and refreshes it; only opens a new
// window when the app isn't open.
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const open = list.find(client => new URL(client.url).origin === self.location.origin);
            if (!open) return clients.openWindow(url);
            open.postMessage({ type: 'refresh' });
            return open.focus();
        })
    );
});

// Take over open pages straight away, so an updated version of this file applies without a restart.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
