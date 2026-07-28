"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { updateUser } from "@/lib/api";
import type { User } from "@/lib/types";
import styles from "./ProfileClient.module.css";

interface FormState {
  name: string;
  email: string;
  phone: string;
}

function formFromUser(user: User): FormState {
  return { name: user.name, email: user.email ?? "", phone: user.phone ?? "" };
}

/**
 * Profile (M7a) — view/edit name/phone/email over the mock `currentUser`
 * record (`updateUser()`, `lib/api/site.ts` — mutates it in place, see
 * that function's comment) and sign-out (`useAuth().signOut()`, then
 * redirect to `/login`).
 *
 * The outer component only handles the `ready`/`user` gates; the actual
 * editable form lives in `ProfileDetails` below, mounted only once `user`
 * is guaranteed defined — its form state is lazily initialized straight
 * from the `user` prop (`useState(() => formFromUser(user))`) instead of
 * synced via a `useEffect`, so there's no synchronous `setState`-in-effect
 * to avoid.
 */
export function ProfileClient() {
  const router = useRouter();
  const { user, ready, signOut, refreshUser } = useAuth();

  function handleSignOut() {
    signOut();
    router.push("/login");
  }

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.wrap}>
        <Card className={styles.signedOut}>
          <p className={styles.emptyTitle}>You&rsquo;re signed out</p>
          <Button variant="primary" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </Card>
      </div>
    );
  }

  return <ProfileDetails user={user} onSignOut={handleSignOut} onSaved={refreshUser} />;
}

function ProfileDetails({
  user,
  onSignOut,
  onSaved,
}: {
  user: User;
  onSignOut: () => void;
  /** Real mode: re-fetches `GET /users/me` after a save so `useAuth().user` reflects the change on the next render/remount — no-op in mock mode. */
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => formFromUser(user));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await updateUser({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      await onSaved();
      setEditing(false);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.subtitle}>Your details across Marketplace, Laundry and Wallet.</p>
      </div>

      <Card className={styles.card}>
        {editing ? (
          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Full name</span>
              <input
                className={styles.input}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                type="email"
                className={styles.input}
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input
                type="tel"
                className={styles.input}
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </label>
            <div className={styles.formActions}>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={!form.name.trim() || saving}>
                Save changes
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setForm(formFromUser(user));
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.view}>
            <div className={styles.avatar} aria-hidden="true">
              {user.name.charAt(0)}
            </div>
            <div className={styles.viewBody}>
              <span className={styles.viewName}>{user.name}</span>
              {user.email && <span className={styles.viewMeta}>{user.email}</span>}
              {user.phone && <span className={styles.viewMeta}>{user.phone}</span>}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
        {saved && <p className={styles.savedNote}>Profile updated.</p>}
      </Card>

      <Card className={styles.metaCard}>
        <div className={styles.metaRow}>
          <span>Member since</span>
          <span>
            {new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className={styles.metaRow}>
          <span>Referral code</span>
          <span className={styles.mono}>{user.referralCode}</span>
        </div>
      </Card>

      <button type="button" className={styles.signOutButton} onClick={onSignOut}>
        <LogOut size={16} strokeWidth={1.7} /> Sign out
      </button>
    </div>
  );
}
