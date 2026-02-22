self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        let soundUrl = undefined;

        if (data.customSound) soundUrl = data.customSound;
        else if (data.type === 'notify_parent') soundUrl = '/notify_parent.mp3';
        else if (data.type === 'notify_kid') soundUrl = '/notify_kid.mp3';

        const options = {
            body: data.body,
            icon: '/icon.png',
            badge: '/icon.png',
            sound: soundUrl,
            vibrate: data.type === 'notify_kid' ? [200, 100, 200, 100, 200, 100, 400] : [200, 100, 200],
            data: { url: data.url || '/' }
        };
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});
