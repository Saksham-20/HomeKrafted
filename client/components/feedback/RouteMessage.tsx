import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import styles from "./RouteMessage.module.css";

export type RouteMessageTone = "neutral" | "error";

export interface RouteMessageProps {
  /** Mono uppercase label above the heading, e.g. "404" or "Something broke". */
  eyebrow: string;
  title: string;
  /** One or two sentences. Say what happened and what the reader can do. */
  body: string;
  /** Buttons/links. Put the safe way out first. */
  actions?: ReactNode;
  tone?: RouteMessageTone;
  /**
   * Extra detail rendered in mono under the actions — a digest, an error
   * id. Never a stack trace: this renders to real visitors.
   */
  detail?: string;
}

/**
 * The panel every `not-found.tsx` / `error.tsx` in the app renders.
 *
 * Centralised because a 404 on the consumer site, inside the HomeKrafter
 * portal and inside the admin panel are the same message in three
 * different shells — the shell is supplied by the route group's layout,
 * so this component only owns the panel itself and stays chrome-free.
 */
export function RouteMessage({
  eyebrow,
  title,
  body,
  actions,
  tone = "neutral",
  detail,
}: RouteMessageProps) {
  return (
    <div className={clsx("container", styles.wrap)}>
      <div className={clsx(styles.panel, tone === "error" && styles.error)}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        {detail ? <p className={styles.detail}>{detail}</p> : null}
      </div>
    </div>
  );
}

export interface RouteMessageLinkProps {
  href: string;
  variant?: "primary" | "outline";
  children: ReactNode;
}

/** Pill CTA for `<RouteMessage actions>` — same shape as the Hero's pair. */
export function RouteMessageLink({
  href,
  variant = "primary",
  children,
}: RouteMessageLinkProps) {
  return (
    <Link
      href={href}
      className={variant === "primary" ? styles.actionPrimary : styles.actionOutline}
    >
      {children}
    </Link>
  );
}

export interface RouteMessageButtonProps {
  onClick: () => void;
  variant?: "primary" | "outline";
  children: ReactNode;
}

/**
 * Same pill, but a real `<button>` — `error.tsx` needs one for `reset()`,
 * which is a function call, not a navigation.
 */
export function RouteMessageButton({
  onClick,
  variant = "primary",
  children,
}: RouteMessageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={variant === "primary" ? styles.actionPrimary : styles.actionOutline}
    >
      {children}
    </button>
  );
}
