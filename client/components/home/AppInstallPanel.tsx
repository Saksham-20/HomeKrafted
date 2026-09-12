import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Smartphone } from "lucide-react";
import { QRTile } from "@/components/ui/QRTile";
import styles from "./AppInstallPanel.module.css";

export interface AppInstallPanelProps {
  className?: string;
}

export function AppInstallPanel({ className }: AppInstallPanelProps) {
  return (
    <div className={clsx(styles.panel, className)} aria-label="Shop on mobile web">
      <div className={styles.iconColumn} aria-hidden="true">
        <div className={styles.phoneIconWrap}>
          <Smartphone size={28} className={styles.phoneIcon} />
        </div>
      </div>

      <div className={styles.copy}>
        <span className={styles.eyebrow}>Mobile Experience</span>
        <h3 className={styles.title}>Order homemade food on the go</h3>
        <p className={styles.subtitle}>
          Fully responsive mobile web experience with fast checkout, live order tracking, and chef stories.
        </p>
        <div className={styles.actionsWrap}>
          <Link href="/shop" className={styles.mobileActionBtn}>
            Shop on mobile web
            <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
          </Link>
          <span className={styles.comingSoonPill}>Native iOS &amp; Android apps coming soon</span>
        </div>
      </div>

      <div className={styles.qrColumn}>
        <QRTile />
      </div>
    </div>
  );
}
