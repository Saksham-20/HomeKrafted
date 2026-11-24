import type { CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Snowflake } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { MoreLink } from "@/components/ui/MoreLink";
import { Snowfall } from "@/components/season/Snowfall";
import snowCap from "@/components/season/SnowCap.module.css";
import { SEASON } from "@/lib/season";
import type { MoodDoor } from "./MoodTiles";
import styles from "./EditBand.module.css";

export interface EditBandProps {
  anchor: string;
  kicker: string;
  title: string;
  more: { label: string; href: string };
  doors: MoodDoor[];
}

/**
 * The season's own shelf: a sentence on the left, four photographed doors
 * on the right with their names laid over the picture. This is the
 * `#winter-edit` every "Winter Edit" link on the site lands on.
 *
 * In winter it is the page's window onto the night (2026-11-24): deep
 * pine with a cool light from one corner, snow lying along its top edge
 * and falling past the four photographs, which glow warm like lit
 * windows — the cold outside, the kitchen in. The footer and the
 * meal-plans card wear the same snow, so the season bookends the page.
 */
export function EditBand({ anchor, kicker, title, more, doors }: EditBandProps) {
  const winter = SEASON.theme === "winter";
  return (
    <section id={anchor} className={styles.section} aria-labelledby="hp-edit-title">
      <div className={clsx("container", "container-wide")}>
        <div className={clsx(styles.panel, winter && [styles.winter, snowCap.cap])}>
          <Snowflake className={styles.flake} size={34} strokeWidth={1.1} aria-hidden="true" />
          <div className={styles.copy}>
            <p className={styles.kicker}>{kicker}</p>
            <h2 id="hp-edit-title" className={styles.title}>
              {title}
            </h2>
            <MoreLink href={more.href} className={styles.more}>
              {more.label}
            </MoreLink>
          </div>
          <ul className={styles.doors}>
            {doors.map((door) => (
              <li key={door.label}>
                <Link
                  href={door.href}
                  className={styles.door}
                  style={door.focus ? ({ "--hp-focus": door.focus } as CSSProperties) : undefined}
                >
                  <ImageSlot
                    ratio="5/4"
                    src={door.image}
                    label={door.label}
                    alt=""
                    sizes="(max-width: 900px) 46vw, 240px"
                    className={styles.photo}
                  />
                  <span className={styles.label}>{door.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {winter && <Snowfall variant="band" count={36} seed={1225} />}
        </div>
      </div>
    </section>
  );
}
