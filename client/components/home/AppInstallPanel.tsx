import clsx from "clsx";
import { QRTile } from "@/components/ui/QRTile";
import { StoreBadges } from "@/components/ui/StoreBadges";
import styles from "./AppInstallPanel.module.css";

export interface AppInstallPanelProps {
  className?: string;
}

/** "Get the app" panel — QR tile + copy + solid App Store/Play badges, ported from the Home app-install band. */
export function AppInstallPanel({ className }: AppInstallPanelProps) {
  return (
    <div className={clsx(styles.panel, className)}>
      <QRTile />
      <div className={styles.copy}>
        <span className={styles.title}>Get the app</span>
        <span className={styles.subtitle}>Scan to install · full meals &amp; live tracking</span>
        <StoreBadges variant="solid" />
      </div>
    </div>
  );
}
