import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";
import styles from "./UserRow.module.css";

export interface UserRowProps {
  user: User;
  href: string;
  onToggleSuspend: (userId: string, suspended: boolean) => void;
}

/** `/admin/users` list row — avatar initial, name, email/phone, role + active/suspended pills, joined date, inline suspend/reactivate. */
export function UserRow({ user, href, onToggleSuspend }: UserRowProps) {
  const initial = user.name.charAt(0).toUpperCase();
  const suspended = user.suspended ?? false;

  return (
    <Card padding="sm" className={styles.row}>
      <Link href={href} className={styles.linkWrap}>
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <span className={styles.body}>
          <span className={styles.name}>{user.name}</span>
          <span className={styles.meta}>
            {user.email ?? user.phone ?? "—"} · Joined {formatDate(user.createdAt)}
          </span>
        </span>
      </Link>
      <span className={styles.badges}>
        <StatusPill status={user.role} />
        <StatusPill status={suspended ? "suspended" : "active"} />
      </span>
      <span className={styles.action}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onToggleSuspend(user.id, !suspended)}
        >
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </span>
    </Card>
  );
}
