"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getMyMealPlanDayMenus, setMyMealPlanDayMenu } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MealPlanDayMenus, MealPlanDayMenuView } from "@/lib/types";
import styles from "./DayMenuEditor.module.css";

export interface DayMenuEditorProps {
  planId: string;
}

/**
 * "What am I actually cooking on the 20th" (M37) — the dated half of a
 * plan's menu, distinct from the `weeklyMenu` rotation the form above
 * edits. Each day saves on its own: a kitchen planning tomorrow at 7pm
 * should not have to re-submit the whole plan (and re-queue it for
 * moderation) to change one date's dal.
 *
 * Locked days render read-only with the lock named. The server enforces
 * the same lock, so the disabled textarea is a courtesy, not the control.
 */
export function DayMenuEditor({ planId }: DayMenuEditorProps) {
  const [data, setData] = useState<MealPlanDayMenus | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getMyMealPlanDayMenus(planId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setDrafts(
          Object.fromEntries(
            result.days.map((day) => [day.date, day.source === "day" ? day.lines.join("\n") : ""]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the day-by-day menus. Refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  async function saveDay(day: MealPlanDayMenuView) {
    setSavingDate(day.date);
    setSavedDate(null);
    setError(undefined);
    try {
      const lines = (drafts[day.date] ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const updated = await setMyMealPlanDayMenu(planId, day.date, lines);
      setData((current) =>
        current
          ? {
              ...current,
              days: current.days.map((d) => (d.date === day.date ? updated : d)),
            }
          : current,
      );
      setDrafts((current) => ({
        ...current,
        [day.date]: updated.source === "day" ? updated.lines.join("\n") : "",
      }));
      setSavedDate(day.date);
    } catch (err) {
      // The refusal is the product: a locked date's message names the lock
      // time and what to do — never collapse it into "try again".
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setSavingDate(null);
    }
  }

  if (error && !data) {
    return (
      <Card className={styles.wrap}>
        <p className={styles.error} role="alert">
          {error}
        </p>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card className={styles.wrap}>
      <h2 className={styles.title}>Day-by-day menus</h2>
      <p className={styles.lead}>
        What you&apos;re actually cooking, date by date. Subscribers see this on their
        plan — an empty day falls back to the weekly rotation above. Days lock at{" "}
        <strong>{data.lockTime}</strong> the evening before, so people can plan
        around what you told them; after that, only Homekrafted support can change
        one.
      </p>

      <div className={styles.days}>
        {data.days.map((day) => {
          const draft = drafts[day.date] ?? "";
          const savedLines = day.source === "day" ? day.lines.join("\n") : "";
          const dirty = draft !== savedLines;
          return (
            <div key={day.date} className={styles.day}>
              <div className={styles.dayHead}>
                <span className={styles.dayDate}>{formatDate(day.date)}</span>
                {day.locked ? (
                  <span className={styles.lockedBadge}>Locked</span>
                ) : day.source === "day" ? (
                  <span className={styles.setBadge}>Set</span>
                ) : day.source === "template" ? (
                  <span className={styles.templateBadge}>From rotation</span>
                ) : null}
                {day.scheduledCount > 0 && (
                  <span className={styles.audience}>
                    {day.scheduledCount === 1
                      ? "1 subscriber gets this"
                      : `${day.scheduledCount} subscribers get this`}
                  </span>
                )}
              </div>

              {day.locked ? (
                <p className={styles.lockedLines}>
                  {day.lines.length > 0 ? day.lines.join(", ") : "Nothing set — the rotation applies."}
                </p>
              ) : (
                <>
                  {day.source === "template" && draft === "" && (
                    <p className={styles.templateHint}>Rotation says: {day.lines.join(", ")}</p>
                  )}
                  <textarea
                    className={styles.linesInput}
                    rows={2}
                    value={draft}
                    placeholder="One dish per line — leave empty to use the rotation"
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [day.date]: event.target.value }))
                    }
                  />
                  {dirty && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => saveDay(day)}
                      disabled={savingDate === day.date}
                    >
                      {savingDate === day.date ? "Saving…" : `Save ${formatDate(day.date)}`}
                    </Button>
                  )}
                  {savedDate === day.date && !dirty && (
                    <span className={styles.savedNote} role="status">
                      Saved.
                      {day.scheduledCount > 0 && " Subscribers scheduled that day have been told."}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className={styles.error} role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </Card>
  );
}
