"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import { areaById, areasByCity } from "@/lib/geo";
import type { SellerApplication } from "@/lib/types";
import styles from "./ApplicationRow.module.css";

const CATEGORY_LABEL: Record<SellerApplication["category"], string> = {
  home_chef: "Home chef",
  maker: "Maker",
  baker: "Baker",
  artist: "Artist",
  other: "Other",
};

export interface ApplicationRowProps {
  application: SellerApplication;
  onApprove: (applicationId: string) => void;
  onReject: (applicationId: string) => void;
  /**
   * Resolve a waitlisted application to a real serviced area. The server
   * moves the row back to `reviewing`, so approving is the next click.
   */
  onAssignArea: (applicationId: string, area: string) => void;
  /** True while any queue mutation is in flight — disables both buttons on every row, since one refetch reloads them all. */
  busy?: boolean;
}

/**
 * `/admin/sellers`'s approval-queue row — application details +
 * approve/reject, the M7b `/sell` → M11a admin decision point.
 *
 * Both buttons disable while any queue action is running. Until M27 they
 * did not, so a slow approval invited a second click and the queue could
 * process the same application twice; worse, Reject sat one button-width
 * from Approve and fired immediately, so a misclick sent a real applicant
 * a permanent rejection with no way back. Reject now asks first — the
 * lightest possible guard, and the one the corporate screen already uses.
 */
export function ApplicationRow({
  application,
  onApprove,
  onReject,
  onAssignArea,
  busy,
}: ApplicationRowProps) {
  // They are already a HomeKrafter, so this application cannot be
  // approved — `Seller.userId` is unique and the server refuses it. Said
  // here, before the button, for the same reason the out-of-area warning
  // is: a queue full of rows that look decidable and are not wastes the
  // one screen where a click sends a real person a welcome message.
  const duplicate = application.existingSeller;

  /*
    The exact condition `approveApplication` refuses on — resolvability,
    not the literal string `'other'`. Matching the server's guard rather
    than re-deriving it from `areaLabel` also covers legacy rows written
    before the area field existed, typos, and any id later removed from
    the area table: all of those are equally unapprovable, and until this
    was added all of them showed a fully enabled Approve button.

    **A pincode application is never unapprovable** (M36) — that is the
    whole point of it, so it short-circuits first. Only pre-M36 rows,
    which carry an area and no pincode, can still land here.
  */
  const unservicedArea = !application.pincode && !areaById(application.area ?? "");
  const [pickedArea, setPickedArea] = useState("");

  function handleReject() {
    const confirmed = window.confirm(
      `Reject ${application.businessName}'s application?\n\n` +
        'They will be told their application was not taken forward. This cannot be undone from here.',
    );
    if (confirmed) onReject(application.id);
  }

  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.body}>
        <span className={styles.title}>{application.businessName}</span>
        <span className={styles.meta}>
          {CATEGORY_LABEL[application.category]} · {application.city}
          {/* Where they actually are (M36) — an admin ringing somebody in
              Faridabad should know that before they pick up, and the city
              alone no longer says it now that applications are national. */}
          {application.pincode ? ` ${application.pincode}` : ""} · {application.contactName} ·{" "}
          {formatDate(application.createdAt)}
        </span>
        {duplicate && (
          <span className={styles.duplicate}>
            Already a HomeKrafter — <strong>{duplicate.displayName}</strong>, since{" "}
            {formatDate(duplicate.since)}
            {duplicate.status === "suspended" ? " (suspended)" : ""}. Approving would fail. Reject
            this duplicate, or help them into the account they have.
          </span>
        )}
        {/*
          An out-of-area applicant is visible BEFORE the approve button,
          not discovered from its refusal. The server won't approve an area
          it can't resolve, so an admin needs to know that here.
          Rendered as plain text — `areaLabel` is free text from a public
          endpoint.
        */}
        {unservicedArea && (
          <span className={styles.outOfArea}>
            <span className={styles.outOfAreaText}>
              {application.areaLabel ? (
                <>
                  Outside our serviced areas — applicant typed &ldquo;{application.areaLabel}&rdquo;.
                  Assign the nearest serviced area to approve them.
                </>
              ) : (
                <>
                  &ldquo;{application.area}&rdquo; is not a serviced area, so this cannot be
                  approved as-is. Assign one to approve them.
                </>
              )}
            </span>
            {/*
              The control that makes the warning actionable (M36). The
              endpoint behind it has existed since M19 and nothing in the
              browser ever called it, so this warning named a fix that
              could not be carried out from any screen — a real kitchen
              sat unapprovable with the reason printed next to a dead
              button.
            */}
            <span className={styles.assignRow}>
              <label className="hk-sr-only" htmlFor={`assign-area-${application.id}`}>
                Serviced area for {application.businessName}
              </label>
              <select
                id={`assign-area-${application.id}`}
                className={styles.assignSelect}
                value={pickedArea}
                onChange={(event) => setPickedArea(event.target.value)}
                disabled={busy}
              >
                <option value="">Choose a serviced area…</option>
                {areasByCity().map((group) => (
                  <optgroup key={group.city} label={group.city}>
                    {group.areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAssignArea(application.id, pickedArea)}
                disabled={busy || !pickedArea}
              >
                Assign area
              </Button>
            </span>
          </span>
        )}
        <span className={styles.description}>{application.description}</span>
        {/*
          What they gave us to check them on (M32). Links are the whole
          point of asking — an admin can look at the work before deciding
          — so they are real links, opened in a new tab so the queue does
          not lose its place. `rel="noreferrer"` because these are URLs a
          stranger submitted.
        */}
        <span className={styles.evidence}>
          {application.instagramUrl && (
            <a
              href={application.instagramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.evidenceLink}
            >
              Instagram
            </a>
          )}
          {application.websiteUrl && (
            <a
              href={application.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.evidenceLink}
            >
              Website
            </a>
          )}
          {application.fssaiNumber && <span>FSSAI {application.fssaiNumber}</span>}
          {application.yearsMaking !== undefined && (
            <span>
              {application.yearsMaking} {application.yearsMaking === 1 ? "year" : "years"} making
            </span>
          )}
          {application.capacityPerDay !== undefined && (
            <span>{application.capacityPerDay}/day</span>
          )}
        </span>
      </div>
      <span className={styles.badges}>
        <StatusPill status={application.status} />
      </span>
      <span className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onApprove(application.id)}
          disabled={busy || Boolean(duplicate) || unservicedArea}
          aria-busy={busy || undefined}
          title={
            duplicate
              ? "This applicant already has a HomeKrafter account"
              : unservicedArea
                ? "Assign a serviced area first — the server refuses an area it cannot resolve"
                : undefined
          }
        >
          {busy ? "Working…" : "Approve"}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleReject} disabled={busy}>
          Reject
        </Button>
      </span>
    </Card>
  );
}
