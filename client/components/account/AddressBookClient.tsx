"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  createAddress,
  deleteAddress,
  getAddresses,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from "@/lib/api";
import type { Address } from "@/lib/types";
import styles from "./AddressBookClient.module.css";

const EMPTY_FORM: AddressInput = {
  label: "",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  instructions: "",
};

function isFormValid(form: AddressInput): boolean {
  return Boolean(
    form.label.trim() &&
      form.recipientName.trim() &&
      form.phone.trim() &&
      form.line1.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      form.pincode.trim(),
  );
}

/**
 * Address book CRUD (M7a; M8.4a real). Full add/edit/delete/set-default
 * over the address book, backed by `lib/api/addresses.ts`'s owner-scoped
 * `/users/me/addresses*` endpoints. Fetches its own initial list on mount
 * (owner-scoped real read, same reasoning as `OrdersListClient` — see
 * `lib/auth/session.ts`'s file header) rather than a server-fetched prop;
 * every mutation keeps local `addresses` state in sync from its return
 * value, same "fetch once, client-updated" pattern `CheckoutClient`'s own
 * inline `addAddress` uses.
 */
export function AddressBookClient() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddressInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAddresses().then((list) => {
      if (cancelled) return;
      setAddresses(list);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAdding(true);
  }

  function startEdit(address: Address) {
    setForm({
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      instructions: address.instructions ?? "",
    });
    setAdding(false);
    setEditingId(address.id);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function set<K extends keyof AddressInput>(key: K, value: AddressInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!isFormValid(form)) return;
    setBusy(true);
    try {
      if (editingId) {
        const updated = await updateAddress(editingId, form);
        if (updated) {
          setAddresses((current) => current.map((a) => (a.id === editingId ? updated : a)));
        }
      } else {
        const created = await createAddress(form);
        setAddresses((current) => [...current, created]);
      }
      cancelForm();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteAddress(id);
      setAddresses((current) => {
        const next = current.filter((a) => a.id !== id);
        const stillHasDefault = next.some((a) => a.isDefault);
        if (!stillHasDefault && next.length > 0) {
          next[0] = { ...next[0], isDefault: true };
        }
        return next;
      });
      if (editingId === id) cancelForm();
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(id: string) {
    setBusy(true);
    try {
      await setDefaultAddress(id);
      setAddresses((current) => current.map((a) => ({ ...a, isDefault: a.id === id })));
    } finally {
      setBusy(false);
    }
  }

  const showForm = adding || editingId !== null;

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading your address book…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Address book</h1>
        <p className={styles.subtitle}>Manage where your orders and laundry pickups ship to.</p>
      </div>

      {!showForm && (
        <Button variant="ghost-gold" className={styles.addButton} onClick={startAdd}>
          <Plus size={16} strokeWidth={1.8} /> Add a new address
        </Button>
      )}

      {showForm && (
        <Card className={styles.formCard}>
          <span className={styles.formTitle}>{editingId ? "Edit address" : "New address"}</span>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Label</span>
              <input
                className={styles.input}
                placeholder="Home, Office, ..."
                value={form.label}
                onChange={(event) => set("label", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Recipient name</span>
              <input
                className={styles.input}
                value={form.recipientName}
                onChange={(event) => set("recipientName", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input
                className={styles.input}
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </label>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Address line 1</span>
              <input
                className={styles.input}
                value={form.line1}
                onChange={(event) => set("line1", event.target.value)}
              />
            </label>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Address line 2 (optional)</span>
              <input
                className={styles.input}
                value={form.line2}
                onChange={(event) => set("line2", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>City</span>
              <input
                className={styles.input}
                value={form.city}
                onChange={(event) => set("city", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>State</span>
              <input
                className={styles.input}
                value={form.state}
                onChange={(event) => set("state", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Pincode</span>
              <input
                className={styles.input}
                value={form.pincode}
                onChange={(event) => set("pincode", event.target.value)}
              />
            </label>
          </div>
          <Textarea
            label="Delivery instructions (optional)"
            rows={2}
            value={form.instructions}
            onChange={(event) => set("instructions", event.target.value)}
          />
          <div className={styles.formActions}>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!isFormValid(form) || busy}>
              {editingId ? "Save changes" : "Save address"}
            </Button>
            <Button variant="secondary" size="sm" onClick={cancelForm} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {addresses.length === 0 && !showForm ? (
        <Card className={styles.empty}>
          <MapPin size={22} strokeWidth={1.6} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No saved addresses</p>
          <p className={styles.emptyCopy}>Add one to speed up checkout and laundry pickups.</p>
        </Card>
      ) : (
        <div className={styles.list}>
          {addresses.map((address) => (
            <Card key={address.id} className={styles.addressCard}>
              <div className={styles.addressTop}>
                <span className={styles.addressLabel}>
                  {address.label}
                  {address.isDefault && <span className={styles.defaultTag}>Default</span>}
                </span>
                <div className={styles.actions}>
                  {!address.isDefault && (
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => handleSetDefault(address.id)}
                      disabled={busy}
                      aria-label={`Set ${address.label} as default`}
                    >
                      <Star size={15} strokeWidth={1.7} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => startEdit(address)}
                    disabled={busy}
                    aria-label={`Edit ${address.label}`}
                  >
                    <Pencil size={15} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    className={clsx(styles.iconButton, styles.deleteButton)}
                    onClick={() => handleDelete(address.id)}
                    disabled={busy}
                    aria-label={`Delete ${address.label}`}
                  >
                    <Trash2 size={15} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
              <p className={styles.addressBody}>
                {address.recipientName} · {address.phone}
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state}{" "}
                {address.pincode}
              </p>
              {address.instructions && (
                <p className={styles.instructions}>Note: {address.instructions}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
