package io.github.eduardgarifzyanov.balance;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.regex.Pattern;

final class ReminderScheduler {
    static final String CHANNEL = "balance-reminders";
    static final String FIRE = "balance.reminders.FIRE";
    static final String FALLBACK = "balance.reminders.FALLBACK";
    static final String SNOOZE = "balance.reminders.SNOOZE";
    static final String OPEN_SECTION = "balance.reminders.SECTION";
    private static final String RECORDS = "reminders";
    private static final long MINUTE = 60_000L;
    private static final long BACKUP_DELAY = 10 * MINUTE;
    private static final Pattern WATER = Pattern.compile("вод[ауые]", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private ReminderScheduler() {}

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("balance-reminders", Context.MODE_PRIVATE);
    }

    private static JSONArray load(Context context) {
        try {
            return new JSONArray(preferences(context).getString(RECORDS, "[]"));
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    private static void save(Context context, JSONArray reminders) {
        preferences(context).edit().putString(RECORDS, reminders.toString()).apply();
    }

    static NotificationManager notifications(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Напоминания", NotificationManager.IMPORTANCE_HIGH));
        return manager;
    }

    static boolean canNotify(Context context) {
        NotificationManager manager = notifications(context);
        return manager.areNotificationsEnabled()
            && manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static boolean canBeExact(Context context) {
        return Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    static synchronized String list(Context context, String legacy) {
        if (!preferences(context).contains(RECORDS)) {
            JSONArray migrated = new JSONArray();
            try {
                JSONArray entries = new JSONArray(legacy);
                for (int index = 0; index < entries.length(); index++) {
                    JSONObject item = entries.optJSONObject(index);
                    try {
                        if (item != null && find(migrated, item.optLong("id")) < 0) {
                            migrated.put(validate(item));
                        }
                    } catch (JSONException ignored) {
                        // A malformed legacy item should not prevent importing the remaining reminders.
                    }
                }
            } catch (JSONException ignored) {}
            save(context, migrated);
            refresh(context, false);
        }
        return load(context).toString();
    }

    static synchronized boolean change(Context context, String action, String argument) {
        JSONArray all = load(context);
        try {
            if ("add".equals(action)) {
                JSONObject item = validate(new JSONObject(argument));
                long id = item.getLong("id");
                while (find(all, id) >= 0) id++;
                item.put("id", id);
                all.put(item);
                arm(context, item, false);
            } else {
                long id = Long.parseLong(argument);
                int index = find(all, id);
                if (index < 0) return false;
                JSONObject item = all.getJSONObject(index);
                if ("delete".equals(action)) {
                    cancel(context, id);
                    all.remove(index);
                } else if ("toggle".equals(action)) {
                    boolean enabled = !item.getBoolean("enabled");
                    item.put("enabled", enabled);
                    if (enabled && item.has("due")) {
                        item.put("due", System.currentTimeMillis() + item.getInt("minutes") * MINUTE);
                    }
                    item.remove("trigger");
                    arm(context, item, false);
                } else {
                    return false;
                }
            }
            save(context, all);
            return true;
        } catch (JSONException | NumberFormatException error) {
            return false;
        }
    }

    private static int find(JSONArray all, long id) {
        for (int index = 0; index < all.length(); index++) {
            JSONObject item = all.optJSONObject(index);
            if (item != null && item.optLong("id") == id) return index;
        }
        return -1;
    }

    private static JSONObject validate(JSONObject input) throws JSONException {
        long id = input.getLong("id");
        String name = input.getString("name").trim();
        if (id < 1 || name.isEmpty() || name.length() > 100) throw new JSONException("Invalid reminder");
        JSONObject item = new JSONObject().put("id", id).put("name", name)
            .put("enabled", input.optBoolean("enabled", true));

        if (input.has("due")) {
            long due = input.getLong("due");
            int minutes = input.getInt("minutes");
            if (due < 1 || minutes < 1 || minutes > 1440) throw new JSONException("Invalid timer");
            return item.put("due", due).put("minutes", minutes);
        }

        String time = input.getString("time");
        if (!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw new JSONException("Invalid time");
        JSONArray days = new JSONArray();
        JSONArray provided = input.getJSONArray("days");
        for (int index = 0; index < provided.length(); index++) {
            int day = provided.getInt(index);
            if (day < 0 || day > 6) throw new JSONException("Invalid weekday");
            days.put(day);
        }
        if (days.length() == 0 || days.length() > 7) throw new JSONException("Invalid weekdays");
        item.put("time", time).put("days", days);
        if (input.has("last")) item.put("last", input.getString("last"));
        return item;
    }

    static synchronized void refresh(Context context, boolean clockChanged) {
        if (!preferences(context).contains(RECORDS)) return;
        JSONArray all = load(context);
        for (int index = 0; index < all.length(); index++) {
            JSONObject item = all.optJSONObject(index);
            if (item == null) continue;
            try {
                arm(context, item, clockChanged);
            } catch (JSONException ignored) {}
        }
        save(context, all);
    }

    private static void arm(Context context, JSONObject item, boolean clockChanged) throws JSONException {
        long id = item.getLong("id");
        cancel(context, id);
        boolean oneTime = item.has("due");
        if (clockChanged && !oneTime) item.remove("trigger");
        if (!item.getBoolean("enabled") || !canNotify(context)) return;

        long trigger = item.optLong("trigger");
        long now = System.currentTimeMillis();
        if (trigger == 0) {
            if (oneTime) {
                trigger = item.getLong("due");
            } else {
                JSONArray days = item.getJSONArray("days");
                int weekdays = 0;
                for (int index = 0; index < days.length(); index++) weekdays |= 1 << days.getInt(index);
                trigger = ReminderTiming.repeat(
                    ZonedDateTime.now(), LocalTime.parse(item.getString("time")), weekdays, item.optString("last"));
            }
        }
        if (trigger < 1) return;
        item.put("trigger", trigger);
        long when = ReminderTiming.oneTime(now, trigger);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (canBeExact(context)) {
            try {
                // Keep an inexact backup in case Android revokes exact-alarm access later.
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when + BACKUP_DELAY, pending(context, FALLBACK, id, trigger));
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending(context, FIRE, id, trigger));
                return;
            } catch (SecurityException ignored) {
                // Access can change between the permission check and the scheduling call.
            }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending(context, FALLBACK, id, trigger));
    }

    private static PendingIntent pending(Context context, String action, long id, long trigger) {
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(action)
            .setData(Uri.parse("balance-reminder://item/" + id))
            .putExtra("id", id).putExtra("trigger", trigger);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancel(Context context, long id) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        alarms.cancel(pending(context, FIRE, id, 0));
        alarms.cancel(pending(context, FALLBACK, id, 0));
    }

    static synchronized void fire(Context context, long id, long trigger) {
        JSONArray all = load(context);
        int index = find(all, id);
        if (index < 0 || trigger < 1) return;
        JSONObject item = all.optJSONObject(index);
        if (!item.optBoolean("enabled") || item.optLong("trigger") != trigger) return;

        cancel(context, id);
        if (!canNotify(context)) return;
        try {
            if (item.has("due")) {
                all.remove(index);
            } else {
                String date = Instant.ofEpochMilli(trigger).atZone(ZoneId.systemDefault()).toLocalDate().toString();
                item.put("last", date);
                item.remove("trigger");
                arm(context, item, false);
            }
            save(context, all);
            notify(context, Long.toString(id), item.getString("name"), id);
        } catch (JSONException ignored) {}
    }

    static synchronized void snooze(Context context, long notificationId) {
        try {
            long now = System.currentTimeMillis();
            JSONObject timer = new JSONObject().put("id", now).put("name", "Пора выпить воды")
                .put("due", now + 15 * MINUTE).put("minutes", 15).put("enabled", true);
            if (change(context, "add", timer.toString())) {
                notifications(context).cancel(Long.toString(notificationId), 0);
            }
        } catch (JSONException ignored) {}
    }

    static boolean test(Context context) {
        if (!canNotify(context)) return false;
        notify(context, "test", "Проверка напоминания", 0);
        return true;
    }

    private static void notify(Context context, String tag, String message, long id) {
        boolean water = id > 0 && WATER.matcher(message).find();
        Intent open = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse("balance-reminder://open/" + tag))
            .putExtra(OPEN_SECTION, water ? "Питание" : "Напоминания");
        PendingIntent tap = PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Баланс")
            .setContentText(message)
            .setStyle(new Notification.BigTextStyle().bigText(message))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(tap)
            .setAutoCancel(true);
        if (water) {
            builder.addAction(new Notification.Action.Builder(null, "Через 15 минут",
                pending(context, SNOOZE, id, 0)).build());
        }
        notifications(context).notify(tag, 0, builder.build());
    }
}

