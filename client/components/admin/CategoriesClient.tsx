"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { ApiError } from "@/lib/api/http";
import { createCategory, getCategoryTree, updateCategory } from "@/lib/api/admin";
import type { CategoryNode } from "@/lib/types";
import type { ProductKind } from "@/lib/types";
import styles from "./CategoriesClient.module.css";

/**
 * `/admin/catalog/categories` — the shelves the whole catalogue browses
 * by, and the only place in the product that creates one (M58).
 *
 * A HomeKrafter *asks* for a shelf (the suggestions queue next door); an
 * admin mints it. That split is the point: a category anybody can add to
 * stops being a shared vocabulary, and "Pickles", "Pickle" and "Achaar"
 * become three half-empty shelves nothing can merge.
 *
 * The "+" is deliberately in two places — once for a top-level shelf, and
 * once per parent for a subcategory — because those are two different
 * decisions and a single button with a parent dropdown makes the common
 * case (adding a child to the group you are looking at) the fiddly one.
 *
 * Renaming is inline (2026-09-04) where it was a `window.prompt`: the
 * prompt could not say that the web address stays as it was, which is
 * the one thing worth knowing before renaming a shelf.
 */

type Draft = { parentId: string | null; group: ProductKind; parentName?: string } | null;

export function CategoriesClient() {
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    getCategoryTree()
      .then((rows) => {
        if (!ignore) {
          setTree(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setTree([]);
        setError(err instanceof ApiError ? err.message : "We could not load the categories.");
      });
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  /**
   * The server's own sentence is what reaches the operator — a duplicate
   * names the shelf that already exists, and a two-deep nest says so. A
   * generic "could not save" would leave them retyping the same name (the
   * M36 rule).
   */
  async function submit() {
    if (!draft || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createCategory({
        name: name.trim(),
        parentId: draft.parentId,
        // Ignored by the server when `parentId` is set — a subcategory
        // follows its parent — but sent so a top-level shelf lands on the
        // right half of the catalogue.
        group: draft.group,
      });
      setName("");
      setDraft(null);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  async function rename(id: string, current: string) {
    const next = renaming?.value.trim();
    if (!next || next === current) {
      setRenaming(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCategory(id, { name: next });
      setRenaming(null);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  const food = (tree ?? []).filter((c) => (c.group ?? "food") === "food");
  const craft = (tree ?? []).filter((c) => c.group === "craft");

  function addForm(key: string) {
    if (!draft || `${draft.group}:${draft.parentId ?? "root"}` !== key) return null;
    return (
      <form
        className={styles.addForm}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label={draft.parentId ? "Subcategory name" : "Category name"}
          hint={
            draft.parentId
              ? `Sits under ${draft.parentName ?? "this shelf"} and shows on the same side of the catalogue.`
              : "A top-level shelf. Buyers see it in the header's menu once something is listed on it."
          }
        >
          <Input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder={draft.parentId ? "e.g. For Grandparents" : "e.g. Shop by price"}
            autoFocus
          />
        </Field>
        <div className={styles.addActions}>
          <Button size="sm" type="submit" disabled={saving || !name.trim()}>
            {saving ? "Adding…" : "Add"}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(null);
              setName("");
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  function addButton(parentId: string | null, group: ProductKind, label: string, parentName?: string) {
    const key = `${group}:${parentId ?? "root"}`;
    return (
      <>
        <button
          className={styles.add}
          type="button"
          onClick={() => {
            setDraft({ parentId, group, parentName });
            setName("");
          }}
          aria-label={label}
        >
          <Plus aria-hidden size={15} /> {parentId ? "Subcategory" : "Category"}
        </button>
        {addForm(key)}
      </>
    );
  }

  function nameControl(node: { id: string; name: string }) {
    if (renaming?.id === node.id) {
      return (
        <form
          className={styles.renameForm}
          onSubmit={(event) => {
            event.preventDefault();
            void rename(node.id, node.name);
          }}
        >
          <Input
            dense
            aria-label={`New name for ${node.name}`}
            value={renaming.value}
            maxLength={60}
            autoFocus
            onChange={(event) => setRenaming({ id: node.id, value: event.target.value })}
          />
          <Button size="sm" type="submit" disabled={saving || !renaming.value.trim()}>
            {saving ? "Saving…" : "Rename"}
          </Button>
          <Button size="sm" type="button" variant="secondary" onClick={() => setRenaming(null)}>
            Cancel
          </Button>
          {/* The one thing worth knowing before renaming a shelf: the slug
              is in every shared URL and everything Google has indexed, so
              it never follows the name (M58). */}
          <span className={styles.renameHint}>The web address stays the same.</span>
        </form>
      );
    }
    return (
      <button
        className={styles.name}
        onClick={() => setRenaming({ id: node.id, value: node.name })}
        type="button"
        aria-label={`Rename ${node.name}`}
      >
        {node.name}
      </button>
    );
  }

  function section(title: string, group: ProductKind, rows: CategoryNode[]) {
    return (
      <section className={styles.group} key={group}>
        <div className={styles.groupHead}>
          <h2 className={styles.groupTitle}>{title}</h2>
          {addButton(null, group, `Add a top-level ${title} category`)}
        </div>
        {rows.length === 0 ? (
          <p className={styles.empty}>No categories on this side of the catalogue yet.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((parent) => (
              <li className={styles.parent} key={parent.id}>
                <Card className={styles.parentCard}>
                  <div className={styles.parentHead}>
                    {nameControl(parent)}
                    <span className={styles.slug}>{parent.slug}</span>
                    {addButton(parent.id, group, `Add a subcategory under ${parent.name}`, parent.name)}
                  </div>
                  {parent.children.length > 0 && (
                    <ul className={styles.children}>
                      {parent.children.map((child) => (
                        <li className={styles.child} key={child.id}>
                          {nameControl(child)}
                          <span className={styles.slug}>{child.slug}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Categories"
        subtitle="The shelves buyers browse by. A HomeKrafter can ask for one from their listing form; approving that ask is what creates it, and so is the button here. Press a name to rename it."
      />

      <CatalogTabs active="categories" />

      {/* `aria-live` so a refusal is announced, not only drawn (M36). */}
      <div aria-live="polite">{error ? <Notice tone="danger">{error}</Notice> : null}</div>

      {tree === null ? (
        <LoadingRows rows={4} />
      ) : (
        <>
          {section("Homemade food", "food", food)}
          {section("Handcrafted gifts", "craft", craft)}
        </>
      )}
    </div>
  );
}
