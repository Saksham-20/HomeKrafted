"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { CharacterPicker } from "@/components/ui/CharacterPicker";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { isChefCharacter } from "@/lib/avatars/chef-characters";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, updateUser } from "@/lib/api";
import type { User } from "@/lib/types";
import { kitchenLoading } from "@/lib/kitchen-copy";
import styles from "./ProfileClient.module.css";

interface FormState {
  name: string;
  email: string;
  phone: string;
  /** A photo they uploaded, a chef character they picked, or "" for neither. */
  avatarSrc: string;
}

function formFromUser(user: User): FormState {
  return {
    name: user.name,
    email: user.email ?? "",
    phone: user.phone ?? "",
    avatarSrc: user.avatarSrc ?? "",
  };
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
        <p className={styles.loading} role="status" aria-live="polite">
          {kitchenLoading("account/profile")}
        </p>
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
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateUser({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        // Sent as `""` when cleared, never `undefined` — the server reads
        // the empty string as "use no picture" and `undefined` as "not
        // part of this edit", so collapsing the two would make removing a
        // picture impossible.
        avatarSrc: form.avatarSrc,
      });
      await onSaved();
      setEditing(false);
      setSaved(true);
    } catch (err) {
      // Without this the server's refusal — "email must be an email;
      // phone must be a valid phone number" — went nowhere at all. The
      // form stayed open with the button un-greyed and nothing said, so
      // Save simply appeared not to work.
      setError(apiErrorMessage(err, "Couldn't save your profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.subtitle}>Your details across the shop, snacks and your wallet.</p>
      </div>

      <Card className={styles.card}>
        {editing ? (
          <div className={styles.form}>
            {/*
              A picture, on the same two terms the HomeKrafter storefront
              offers (2026-09-04): upload your own face, or pick one of
              the drawn characters. Nothing is ever assigned — an account
              with neither keeps the initial-letter disc, because a
              portrait nobody chose is an invention (the M38b rule).
            */}
            <div className={styles.avatarField}>
              <ImageUpload
                label="Your picture"
                purpose="profile"
                shape="circle"
                ratio="1/1"
                placeholderLabel="No picture yet"
                hint={
                  isChefCharacter(form.avatarSrc)
                    ? "Showing the character you picked. Drop a real photo here any time."
                    : "A photo of you, square works best. It shows next to your reviews."
                }
                value={isChefCharacter(form.avatarSrc) ? "" : form.avatarSrc}
                previewSrc={isChefCharacter(form.avatarSrc) ? form.avatarSrc : undefined}
                onChange={(url) => set("avatarSrc", url)}
              />
              <CharacterPicker
                value={form.avatarSrc}
                name="hk-profile-character"
                lead="Rather not use a photo? Pick someone to stand in. You can swap it for a real one whenever you like."
                onChange={(src) => set("avatarSrc", src)}
              />
            </div>
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
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
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
            {user.avatarSrc ? (
              // `alt=""` — their name is the very next node.
              <span className={styles.avatarImage}>
                <ImageSlot ratio="1/1" shape="circle" label={user.name} src={user.avatarSrc} alt="" sizes="52px" compact />
              </span>
            ) : (
              <div className={styles.avatar} aria-hidden="true">
                {user.name.charAt(0)}
              </div>
            )}
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
