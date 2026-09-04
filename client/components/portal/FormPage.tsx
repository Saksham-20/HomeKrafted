"use client";

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { scrollBehavior } from "@/lib/motion";
import styles from "./FormPage.module.css";

export interface FormPageSection {
  /** Must match a `<FormSection id>` on the page. */
  id: string;
  label: string;
  /** Everything this section asks for is answered. */
  done?: boolean;
  /** How many things it still asks for. Ignored when `done`. */
  todo?: number;
}

export interface FormPageProps {
  /** Omit for a short form that needs no jump-nav. */
  sections?: FormPageSection[];
  navLabel?: string;
  children: ReactNode;
}

/**
 * A long form's page frame: the sections in a column, and a jump-nav
 * beside them listing every section with what it still needs.
 *
 * The profile screen was ~4,800px tall at 1280 with nine cards and no
 * way to reach the eighth except scrolling past seven. A completion meter
 * at the top named the gaps and linked to none of them. This nav is the
 * meter and the way there in one: a section that is finished gets a
 * tick, one with gaps gets a count, and every row is a link. It tracks
 * the section in view so somebody scrolling knows where they are.
 *
 * Wide, it is a sticky column on the right; below 1000px it becomes a
 * chip strip above the form, because a 216px column on a phone is the
 * form's whole width.
 */
export function FormPage({ sections, navLabel = "On this page", children }: FormPageProps) {
  const hasNav = Boolean(sections && sections.length > 0);
  return (
    <div className={clsx(styles.layout, hasNav && styles.withNav)}>
      <div className={styles.main}>{children}</div>
      {hasNav && sections && <SectionNav sections={sections} label={navLabel} />}
    </div>
  );
}

function SectionNav({ sections, label }: { sections: FormPageSection[]; label: string }) {
  const [active, setActive] = useState<string | undefined>(sections[0]?.id);
  // A stable key, so the observer is rebuilt when the *set* of sections
  // changes and not on every render that hands in a fresh array.
  const key = sections.map((s) => s.id).join("|");

  useEffect(() => {
    const targets = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    // Whichever observed section is nearest the top of the upper part of
    // the viewport is "current". The bands mean a section counts once its
    // heading has cleared the top fifth, and stops counting once it has
    // scrolled most of the way out.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: 0 },
    );
    targets.forEach((target) => io.observe(target));
    return () => io.disconnect();
  }, [key]);

  function jump(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    // The section is `tabIndex={-1}` (FormSection), so focus follows the
    // scroll — a keyboard user's next Tab lands on the first field of the
    // section they chose, not back at the top of the nav.
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav className={clsx(styles.nav, "hk-scroll")} aria-label={label}>
      <span className={styles.navTitle} aria-hidden="true">
        {label}
      </span>
      {sections.map((section) => {
        const current = active === section.id;
        const todo = !section.done && section.todo ? section.todo : 0;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={clsx(styles.navLink, current && styles.navLinkActive)}
            aria-current={current ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              jump(section.id);
            }}
          >
            <span
              className={clsx(
                styles.dot,
                section.done && styles.dotDone,
                todo > 0 && styles.dotTodo,
              )}
              aria-hidden="true"
            >
              {section.done ? <Check size={11} strokeWidth={3} /> : todo > 0 ? todo : null}
            </span>
            <span className={styles.navText}>
              {section.label}
              {section.done && <span className="hk-sr-only"> — complete</span>}
              {todo > 0 && (
                <span className="hk-sr-only">
                  {" "}
                  — {todo} to fill in
                </span>
              )}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
