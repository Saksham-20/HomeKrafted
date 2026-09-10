import clsx from "clsx";
import { Smartphone } from "lucide-react";
import { QRTile } from "@/components/ui/QRTile";
import { StoreBadges } from "@/components/ui/StoreBadges";
import styles from "./AppInstallPanel.module.css";

export interface AppInstallPanelProps {
  className?: string;
}

export function AppInstallPanel({ className }: AppInstallPanelProps) {
  return (
    <div className={clsx(styles.panel, className)} aria-label="Get the HomeKrafted app">
      <div className={styles.iconColumn} aria-hidden="true">
        <div className={styles.phoneIconWrap}>
          <Smartphone size={28} className={styles.phoneIcon} />
        </div>
      </div>

      <div className={styles.copy}>
        <span className={styles.eyebrow}>Mobile Experience</span>
        <h3 className={styles.title}>Order homemade food on the go</h3>
        <p className={styles.subtitle}>
          Scan to install · Fresh meal subscriptions &amp; live kitchen tracking
        </p>
        <div className={styles.badgesWrap}>
          <StoreBadges variant="solid" />
        </div>
      </div>

      <div className={styles.qrColumn}>
        <QRTile />
      </div>
    </div>
  );
}
