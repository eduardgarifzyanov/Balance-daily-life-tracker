package io.github.eduardgarifzyanov.balance;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ReminderScheduler.FIRE.equals(action) || ReminderScheduler.FALLBACK.equals(action)) {
            ReminderScheduler.fire(context, intent.getLongExtra("id", 0), intent.getLongExtra("trigger", 0));
        } else if (ReminderScheduler.SNOOZE.equals(action)) {
            ReminderScheduler.snooze(context, intent.getLongExtra("id", 0));
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            boolean clockChanged = Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action);
            ReminderScheduler.refresh(context, clockChanged);
        }
    }
}

