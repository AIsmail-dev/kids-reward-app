package com.ahmed.kidsrewards;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import com.google.androidbrowserhelper.trusted.DelegationService;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Shows the site's web push notifications, like the stock DelegationService, but plays the recorded
 * prayer clip for prayer notifications. Chrome ignores the sound a website asks for, so the choice
 * has to be made here.
 *
 * public/push-sw.js marks a prayer notification with the tag "sound-[<kid>_]<prayer>_<now|remind>",
 * which Chrome includes in the platform tag it hands over. The clip that calls the kid by name
 * (res/raw/<kid>_<prayer>_<kind>, made by scripts/gen-kid-prayer-clips.sh) is used when the app has
 * one, otherwise the generic clip (copied from ../public at build time). Everything else goes to the
 * stock behaviour.
 */
public class PrayerSoundDelegationService extends DelegationService {
    private static final Pattern SOUND_TAG = Pattern.compile("sound-(?:([a-z0-9]+)_)?((?:fajr|dhuhr|asr|maghrib|isha)_(?:now|remind))");
    private static final String[][] PRAYERS = {
            {"fajr", "فجر", "الفجر"}, {"dhuhr", "ظهر", "الظهر"}, {"asr", "عصر", "العصر"},
            {"maghrib", "مغرب", "المغرب"}, {"isha", "عشاء", "العشاء"}};
    private static final long[] VIBRATION = {0, 200, 100, 200, 100, 200, 100, 400};

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            Notification notification, String channelName) {
        String sound = null;
        int resId = 0;
        for (String candidate : soundsFor(platformTag, notification)) {
            sound = candidate;
            resId = getResources().getIdentifier(candidate, "raw", getPackageName());
            if (resId != 0) break;
        }
        if (resId == 0) {
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return false;

        // By name, not by resource id: a channel keeps its sound URI for good, and ids shift when
        // clips are added in a later build.
        Uri uri = Uri.parse("android.resource://" + getPackageName() + "/raw/" + sound);
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        Notification.Builder builder = Notification.Builder.recoverBuilder(this, notification);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // A channel's sound is fixed when it is created, so each clip gets its own channel.
            String channelId = "prayer2_" + sound;
            manager.deleteNotificationChannel("prayer_" + sound); // 1.0.2-1.0.3 channels, id-based URI
            NotificationChannel channel =
                    new NotificationChannel(channelId, channelLabel(sound), NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(uri, audio);
            channel.enableVibration(true);
            channel.setVibrationPattern(VIBRATION);
            manager.createNotificationChannel(channel);
            if (manager.getNotificationChannel(channelId).getImportance() == NotificationManager.IMPORTANCE_NONE) {
                return false;
            }
            builder.setChannelId(channelId);
        } else {
            builder.setSound(uri, audio).setVibrate(VIBRATION);
        }

        manager.notify(platformTag, platformId, builder.build());
        return true;
    }

    /**
     * Clip names to try, best first (e.g. "yahia_dhuhr_now", "dhuhr_now") for a prayer notification;
     * empty for any other notification.
     */
    private static String[] soundsFor(String platformTag, Notification notification) {
        Matcher tagged = SOUND_TAG.matcher(platformTag == null ? "" : platformTag);
        if (tagged.find()) {
            String kid = tagged.group(1), clip = tagged.group(2);
            return kid == null ? new String[] {clip} : new String[] {kid + "_" + clip, clip};
        }

        // Fallback in case the tag doesn't come through: recognise api/trigger_prayer_reminders.js's wording.
        if (notification.extras == null) return new String[0];
        String title = String.valueOf(notification.extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = String.valueOf(notification.extras.getCharSequence(Notification.EXTRA_TEXT));
        boolean reminder = title.contains("تذكير بالصلاة");
        if (!reminder && !title.contains("وقت الصلاة")) return new String[0];
        for (String[] prayer : PRAYERS) {
            if (text.contains(prayer[1])) return new String[] {prayer[0] + (reminder ? "_remind" : "_now")};
        }
        return new String[0];
    }

    /** Name shown under the app's notification settings. */
    private static String channelLabel(String sound) {
        for (String[] prayer : PRAYERS) {
            if (("_" + sound).contains("_" + prayer[0] + "_")) {
                return (sound.endsWith("_remind") ? "تذكير صلاة " : "صلاة ") + prayer[2];
            }
        }
        return sound;
    }
}
