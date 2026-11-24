import type { CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Snowflake } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { SectionHead } from "./SectionHead";
import styles from "./MoodTiles.module.css";

export interface MoodDoor {
  label: string;
  href: string;
  image: string;
  focus?: string;
}

export interface MoodTilesProps {
  title: string;
  subtitle: string;
  doors: MoodDoor[];
}

/**
 * "What are you in the mood for?" — six photographed doors. A grid on a
 * wide screen, a row you swipe on a phone (snap points, so a flick lands
 * on a tile rather than between two).
 */
export function MoodTiles({ title, subtitle, doors }: MoodTilesProps) {
  return (
    <section className={styles.section} aria-labelledby="hp-mood-title">
      <Snowflake className={clsx(styles.flake, styles.flakeLeft)} size={30} strokeWidth={1.1} aria-hidden="true" />
      <Snowflake className={clsx(styles.flake, styles.flakeRight)} size={30} strokeWidth={1.1} aria-hidden="true" />
      <div className={clsx("container", "container-wide")}>
        <SectionHead id="hp-mood-title" title={title} subtitle={subtitle} />
        <ul className={styles.grid}>
          {doors.map((door) => (
            <li key={door.label}>
              <Link
                href={door.href}
                className={styles.tile}
                // The crop is data (the subject sits off-centre in some
                // photographs), so it travels as a custom property.
                style={door.focus ? ({ "--hp-focus": door.focus } as CSSProperties) : undefined}
              >
                <ImageSlot
                  ratio="4/3"
                  src={door.image}
                  label={door.label}
                  alt=""
                  sizes="(max-width: 560px) 44vw, (max-width: 900px) 30vw, 220px"
                  className={styles.photo}
                />
                <span className={styles.label}>{door.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
