import { supabase } from './supabaseClient';
import { VAPID_PUBLIC } from './vapidKeys';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function requestPushPermission(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }

    if (Notification.permission === 'default') {
        await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
        try {
            const registration = await navigator.serviceWorker.register('/push-sw.js');
            await navigator.serviceWorker.ready;
            const activeReg = await navigator.serviceWorker.getRegistration();
            if (!activeReg) return false;

            let subscription = await activeReg.pushManager.getSubscription();

            if (!subscription) {
                subscription = await activeReg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
                });
            }

            const subJson = subscription.toJSON();
            console.log("Saving push sub for user", userId, subJson);

            // Check if it's already in the database
            const { data } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
            const exists = data?.find(sub => sub.subscription?.endpoint === subJson.endpoint);

            if (!exists) {
                const { error } = await supabase.from('push_subscriptions').insert({
                    user_id: userId,
                    subscription: subJson
                });
                if (error) console.error("Error saving subscription:", error);
            }
            return true;
        } catch (e) {
            console.error("Push registration failed", e);
            return false;
        }
    }
    return false;
}

export async function sendNotification(payload) {
    try {
        await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("Failed to trigger push API", e);
    }
}
