import clsx from "clsx";
import { CalendarClock, Clock, Globe, Link2, MessageCircle, Package, Utensils } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import type { VendorAvailability, VendorProfile } from "@/lib/types";
import styles from "./KitchenProfile.module.css";

export interface KitchenProfileProps {
  profile: VendorProfile;
  vendorName: string;
  /**
   * M16 (M2). When present, the facts strip gains a "next available"
   * line and the page lists days the kitchen is closed. Computed by the
   * page (a Server Component) and passed down as text — nothing here
   * reads the clock, so nothing re-derives "today" during hydration.
   */
  nextAvailableLabel?: string;
  availability?: VendorAvailability;
  className?: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 8 Aug" — parsed as a local date so a `YYYY-MM-DD` doesn't slide a day across a timezone. */
function formatDayOff(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAY_NAMES[date.getDay()]} ${day} ${MONTH_NAMES[month - 1]}`;
}

/** "3 hours", "2 days", "45 min" — a home cook's prep time spans all three. */
function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 24) {
    const hours = mins / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  }
  const days = Math.round(mins / (60 * 24));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Collapses a `workingDays` array into something readable — "Mon–Sat",
 * "Tue, Thu, Sat" — rather than seven chips. Only merges genuinely
 * contiguous runs, so a Tue/Wed/Sat kitchen doesn't get flattened into a
 * range it doesn't keep.
 */
function formatDays(days: number[]): string {
  if (days.length === 0) return "";
  if (days.length === 7) return "Every day";
  const sorted = [...days].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1] + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) =>
      run.length >= 3 ? `${DAY_NAMES[run[0]]}–${DAY_NAMES[run[run.length - 1]]}` : run.map((d) => DAY_NAMES[d]).join(", "),
    )
    .join(", ");
}

/**
 * The body of a HomeKrafter's profile (M16) — story, kitchen photos, the
 * practical facts of ordering from them, and the policies a dispute gets
 * decided on.
 *
 * Every block renders only when it has content. A kitchen approved this
 * morning has an empty profile and should look like a plain storefront,
 * not like a page full of "not provided" — the seller portal's completion
 * meter is where the gaps get pointed out, to the person who can fill
 * them.
 */
export function KitchenProfile({
  profile,
  vendorName,
  nextAvailableLabel,
  availability,
  className,
}: KitchenProfileProps) {
  const facts = [
    nextAvailableLabel && {
      key: "next",
      Icon: CalendarClock,
      label: "Next available",
      value: nextAvailableLabel,
    },
    profile.prepTimeMins != null && {
      key: "prep",
      Icon: Clock,
      label: "Usually ready in",
      value: formatDuration(profile.prepTimeMins),
    },
    profile.workingDays.length > 0 && {
      key: "days",
      Icon: Utensils,
      label: "Cooks on",
      value:
        formatDays(profile.workingDays) +
        (profile.opensAt && profile.closesAt ? `, ${profile.opensAt}–${profile.closesAt}` : ""),
    },
    profile.responseTimeMins != null && {
      key: "reply",
      Icon: MessageCircle,
      label: "Usually replies in",
      value: formatDuration(profile.responseTimeMins),
    },
    profile.minOrderValue != null && {
      key: "min",
      Icon: Package,
      label: "Minimum order",
      value: formatCurrency(profile.minOrderValue),
    },
  ].filter(Boolean) as { key: string; Icon: typeof Clock; label: string; value: string }[];

  const policies = [
    profile.hygieneNote && { key: "hygiene", label: "Hygiene", body: profile.hygieneNote },
    profile.packagingNote && { key: "packaging", label: "Packaging", body: profile.packagingNote },
    profile.cancellationPolicy && {
      key: "cancellation",
      label: "Cancellations",
      body: profile.cancellationPolicy,
    },
    profile.returnPolicy && { key: "return", label: "Returns", body: profile.returnPolicy },
    profile.acceptsCustomOrders &&
      profile.customOrderPolicy && {
        key: "custom",
        label: "Custom orders",
        body: profile.customOrderPolicy,
      },
  ].filter(Boolean) as { key: string; label: string; body: string }[];

  const socials = [
    // lucide dropped its brand glyphs, and CLAUDE.md reserves inline SVG
    // for the brand marks we actually ship (WhatsApp, App Store, Play).
    // A neutral link icon next to the platform's name says the same thing
    // without us hand-drawing three logos.
    profile.instagramUrl && { key: "instagram", Icon: Link2, label: "Instagram", href: profile.instagramUrl },
    profile.facebookUrl && { key: "facebook", Icon: Link2, label: "Facebook", href: profile.facebookUrl },
    profile.youtubeUrl && { key: "youtube", Icon: Link2, label: "YouTube", href: profile.youtubeUrl },
    profile.websiteUrl && { key: "website", Icon: Globe, label: "Website", href: profile.websiteUrl },
  ].filter(Boolean) as { key: string; Icon: typeof Globe; label: string; href: string }[];

  // Only days off still ahead, and only a handful — a buyer needs to know
  // this kitchen is shut next Tuesday, not every date they have ever
  // blocked out.
  const upcomingDaysOff = (availability?.blackouts ?? []).slice(0, 6);

  const hasAnything =
    upcomingDaysOff.length > 0 ||
    profile.story ||
    profile.photos.length > 0 ||
    facts.length > 0 ||
    policies.length > 0 ||
    profile.knownFor.length > 0 ||
    profile.languages.length > 0 ||
    socials.length > 0;

  if (!hasAnything) return null;

  return (
    <div className={clsx(styles.wrap, className)}>
      {facts.length > 0 && (
        <ul className={styles.facts}>
          {facts.map(({ key, Icon, label, value }) => (
            <li key={key} className={styles.fact}>
              <Icon size={17} aria-hidden="true" className={styles.factIcon} />
              <span className={styles.factText}>
                <span className={styles.factLabel}>{label}</span>
                <span className={styles.factValue}>{value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(profile.story || profile.knownFor.length > 0 || profile.languages.length > 0) && (
        <Card className={styles.card} padding="lg">
          <h2 className={styles.title}>The story behind {vendorName}</h2>
          {profile.story && (
            <div className={styles.story}>
              {/* Stored as plain text with blank lines between paragraphs —
                  a home cook writing about their kitchen shouldn't have to
                  think about markup, and rendering their input as HTML
                  would be an injection surface for nothing. */}
              {profile.story.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}
          {(profile.knownFor.length > 0 || profile.languages.length > 0) && (
            <dl className={styles.meta}>
              {profile.knownFor.length > 0 && (
                <div className={styles.metaRow}>
                  <dt>Known for</dt>
                  <dd>{profile.knownFor.join(" · ")}</dd>
                </div>
              )}
              {profile.languages.length > 0 && (
                <div className={styles.metaRow}>
                  <dt>Speaks</dt>
                  <dd>{profile.languages.join(", ")}</dd>
                </div>
              )}
            </dl>
          )}
        </Card>
      )}

      {profile.photos.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.title}>Inside the kitchen</h2>
          <ul className={styles.photos}>
            {profile.photos.map((photo) => (
              <li key={photo.id} className={styles.photo}>
                <ImageSlot
                  ratio="4/3"
                  src={photo.url}
                  label={photo.caption ?? `${vendorName} kitchen photo`}
                  alt={photo.caption ?? `Inside ${vendorName}'s kitchen`}
                  sizes="(max-width: 640px) 100vw, 300px"
                  compact
                />
                {photo.caption && <p className={styles.caption}>{photo.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcomingDaysOff.length > 0 && (
        <Card className={styles.card} padding="lg">
          <h2 className={styles.title}>Days {vendorName} is closed</h2>
          <ul className={styles.daysOff}>
            {upcomingDaysOff.map((day) => (
              <li key={day.date} className={styles.dayOff}>
                <span className={styles.dayOffDate}>{formatDayOff(day.date)}</span>
                {day.reason && <span className={styles.dayOffReason}>{day.reason}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {policies.length > 0 && (
        <Card className={styles.card} padding="lg">
          <h2 className={styles.title}>Good to know before you order</h2>
          <dl className={styles.policies}>
            {policies.map((policy) => (
              <div key={policy.key} className={styles.policy}>
                <dt>{policy.label}</dt>
                <dd>{policy.body}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {socials.length > 0 && (
        <ul className={styles.socials}>
          {socials.map(({ key, Icon, label, href }) => (
            <li key={key}>
              <a
                className={styles.social}
                href={href}
                // A HomeKrafter's own link, off our origin — `noopener`
                // so the opened tab can't reach back through `window.opener`.
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
