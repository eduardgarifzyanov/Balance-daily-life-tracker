package io.github.eduardgarifzyanov.balance;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;

final class ReminderTiming {
    private ReminderTiming() {}

    static long oneTime(long nowMillis, long dueMillis) {
        return Math.max(nowMillis, dueMillis);
    }

    static long repeat(ZonedDateTime now, LocalTime time, int weekdays, String lastDate) {
        for (int offset = 0; offset <= 7; offset++) {
            LocalDate date = now.toLocalDate().plusDays(offset);
            int day = date.getDayOfWeek().getValue() % 7;
            if ((weekdays & (1 << day)) == 0 || date.toString().equals(lastDate)) continue;

            // Resolve nonexistent or repeated local times using the device's time zone.
            ZonedDateTime due = date.atTime(time).atZone(now.getZone());
            if (due.plusMinutes(1).isAfter(now)) {
                return oneTime(now.toInstant().toEpochMilli(), due.toInstant().toEpochMilli());
            }
        }
        return -1;
    }
}

