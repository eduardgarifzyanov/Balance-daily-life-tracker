package io.github.eduardgarifzyanov.balance;

import java.time.LocalTime;
import java.time.ZonedDateTime;

public final class ReminderTimingTest {
    private static void expect(long actual, long expected) {
        if (actual != expected) throw new AssertionError("Expected " + expected + ", got " + actual);
    }

    private static long stamp(String time) {
        return ZonedDateTime.parse(time).toInstant().toEpochMilli();
    }

    public static void main(String[] args) {
        int monday = 1 << 1;
        int sunday = 1;
        LocalTime nine = LocalTime.of(9, 0);
        ZonedDateTime before = ZonedDateTime.parse("2026-11-23T08:30:00+03:00[Europe/Moscow]");
        expect(ReminderTiming.repeat(before, nine, monday, ""), stamp("2026-11-23T09:00:00+03:00[Europe/Moscow]"));
        expect(ReminderTiming.repeat(before, nine, monday, "2026-11-23"), stamp("2026-11-30T09:00:00+03:00[Europe/Moscow]"));
        expect(ReminderTiming.repeat(before.withHour(10), nine, monday, ""), stamp("2026-11-30T09:00:00+03:00[Europe/Moscow]"));
        ZonedDateTime sameMinute = before.withHour(9).withMinute(0).withSecond(30);
        expect(ReminderTiming.repeat(sameMinute, nine, monday, ""), sameMinute.toInstant().toEpochMilli());
        ZonedDateTime dst = ZonedDateTime.parse("2026-03-29T00:00:00+01:00[Europe/Berlin]");
        expect(ReminderTiming.repeat(dst, LocalTime.of(2, 30), sunday, ""), stamp("2026-03-29T03:30:00+02:00[Europe/Berlin]"));
        expect(ReminderTiming.oneTime(1000, 500), 1000);
        expect(ReminderTiming.oneTime(1000, 1500), 1500);
        expect(ReminderTiming.repeat(before, nine, 0, ""), -1);
        System.out.println("8 reminder timing checks passed");
    }
}

