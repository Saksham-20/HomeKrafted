"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, Input, Select, Switch } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { ApiError } from "@/lib/api/http";
import {
  addAttributeOption,
  createAttribute,
  getAttributes,
  getCategoryTree,
  setShelfQuestion,
  updateAttribute,
  type AdminAttribute,
  type AttributeRequirement,
} from "@/lib/api/admin";
import type { CategoryNode } from "@/lib/types";
import styles from "./AttributesClient.module.css";

const KINDS: { value: AdminAttribute["kind"]; label: string }[] = [
  { value: "single", label: "Pick one" },
  { value: "multi", label: "Pick several" },
  { value: "text", label: "Written answer" },
  { value: "number", label: "A number" },
  { value: "boolean", label: "Yes or no" },
  { value: "dimensions", label: "Dimensions" },
];

const REQUIREMENTS: { value: AttributeRequirement | "none"; label: string }[] = [
  { value: "none", label: "Not asked" },
  { value: "optional", label: "Optional" },
  { value: "encouraged", label: "Encouraged" },
  { value: "required", label: "Required" },
];

/**
 * `/admin/catalog/attributes` (G1) — the questions each shelf asks.
 *
 * **The point of this screen is that adding a question needs no deploy.**
 * Until G1 "what the listing form asks" was a hardcoded slug map in the
 * client (`lib/sell/listing-families.ts`), and it had already drifted from
 * the database: five live craft shelves appeared in no question set, so
 * thirty bangle listings were asked the generic one, and the server — which
 * knew nothing of families — could not refuse a wrong answer at all.
 *
 * Two of the switches carry rules rather than preferences, and both are
 * spelled out on the row rather than left to a tooltip:
 *
 * - **Never auto-filled** (`trustSensitive`) is the promise that a machine
 *   will not answer this question on a maker's behalf — allergens, vegan,
 *   nickel-free, what age a toy is safe for. A wrong guess there is not a
 *   tidy-up somebody corrects later; it is the platform making a safety
 *   claim in a maker's name.
 * - **Needs re-approval** (`material`) sends a live listing back to the
 *   queue when its answer changes. Spend it on what the listing *is*, not
 *   on how it looks: a colour swatch must not take somebody off sale.
 */
export function AttributesClient() {
  const [attributes, setAttributes] = useState<AdminAttribute[] | null>(null);
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ key: "", label: "", kind: "single" as AdminAttribute["kind"] });

  const [optionDraft, setOptionDraft] = useState({ value: "", label: "" });

  useEffect(() => {
    let ignore = false;
    Promise.all([getAttributes(), getCategoryTree()])
      .then(([rows, categories]) => {
        if (ignore) return;
        setAttributes(rows);
        setTree(categories);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        // A failed read is a Notice with Try again, never the empty state —
        // "no questions yet" over a real list is the shape this rule exists
        // to stop.
        setAttributes([]);
        setError(err instanceof ApiError ? err.message : "We could not load the questions.");
      });
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  /** Every shelf, flattened, with its parent named — what a link row offers. */
  const shelves = useMemo(
    () =>
      tree.flatMap((parent) => [
        { id: parent.id, label: parent.name, group: parent.group ?? "food" },
        ...parent.children.map((child) => ({
          id: child.id,
          label: `${parent.name} › ${child.name}`,
          group: child.group ?? parent.group ?? "food",
        })),
      ]),
    [tree],
  );

  function report(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setReloadToken((n) => n + 1);
      return true;
    } catch (err) {
      report(err, "That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitNew() {
    if (!draft.key.trim() || !draft.label.trim()) return;
    const ok = await run(() =>
      createAttribute({ key: draft.key.trim(), label: draft.label.trim(), kind: draft.kind }),
    );
    if (ok) {
      setDraft({ key: "", label: "", kind: "single" });
      setAdding(false);
    }
  }

  function requirementOn(attribute: AdminAttribute, categoryId: string): AttributeRequirement | "none" {
    return attribute.shelves.find((shelf) => shelf.categoryId === categoryId)?.requirement ?? "none";
  }

  return (
    <div className={styles.wrap}>
      <AdminPageHeader
        title="Questions"
        subtitle="What each shelf asks a maker when they list something. Adding a question here changes the listing form and the browse filters — no deploy, no code."
      />

      <CatalogTabs active="attributes" />

      {/* `aria-live` so a refusal is announced, not only drawn (M36). */}
      <div aria-live="polite">
        {error ? (
          <Notice
            tone="danger"
            actions={
              <Button size="sm" variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
                Try again
              </Button>
            }
          >
            {error}
          </Notice>
        ) : null}
      </div>

      <div className={styles.head}>
        {adding ? (
          <Card className={styles.addForm}>
            <FieldGrid columns={3}>
              <Field
                label="Question"
                hint="What a maker reads on the form."
              >
                <Input
                  value={draft.label}
                  maxLength={80}
                  autoFocus
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  placeholder="e.g. Burn time"
                />
              </Field>
              <Field
                label="Key"
                hint="Lower-case, no spaces. This never changes afterwards — every saved answer and every shared filter link points at it."
              >
                <Input
                  value={draft.key}
                  maxLength={64}
                  onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                  placeholder="burn_time_hours"
                />
              </Field>
              <Field label="Kind of answer">
                <Select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft({ ...draft, kind: event.target.value as AdminAttribute["kind"] })
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>
            <div className={styles.actions}>
              <Button size="sm" onClick={() => void submitNew()} disabled={busy || !draft.label.trim() || !draft.key.trim()}>
                {busy ? "Adding…" : "Add question"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <button className={styles.add} type="button" onClick={() => setAdding(true)}>
            <Plus aria-hidden size={15} /> New question
          </button>
        )}
      </div>

      {attributes !== null && attributes.length > 0 ? (
        <Card className={styles.legend}>
          <dl className={styles.legendList}>
            <div>
              <dt>Buyers can filter by it</dt>
              <dd>Appears in the filter sheet once enough listings have answered it.</dd>
            </div>
            <div>
              <dt>Never auto-filled</dt>
              <dd>
                Only a person answers it — allergens, vegan, what age a toy is safe for. Nothing
                ever suggests one of these on a maker’s behalf.
              </dd>
            </div>
            <div>
              <dt>Needs re-approval</dt>
              <dd>
                Changing the answer sends a live listing back to the review queue. Keep it for what
                the thing is, not how it looks.
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {attributes === null ? (
        <LoadingRows rows={5} />
      ) : attributes.length === 0 && !error ? (
        <p className={styles.empty}>No questions yet. Add one, then say which shelves ask it.</p>
      ) : (
        <ul className={styles.list}>
          {attributes.map((attribute) => (
            <li key={attribute.id}>
              <Card className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.label}>{attribute.label}</h2>
                    <p className={styles.meta}>
                      <span className={styles.key}>{attribute.key}</span>
                      {" · "}
                      {KINDS.find((kind) => kind.value === attribute.kind)?.label}
                      {attribute.unit ? ` · ${attribute.unit}` : ""}
                      {" · "}
                      {attribute.shelves.length === 0
                        ? "asked on no shelf yet"
                        : `asked on ${attribute.shelves.length} shelf${attribute.shelves.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <button
                    className={styles.add}
                    type="button"
                    aria-expanded={expanded === attribute.id}
                    onClick={() => setExpanded(expanded === attribute.id ? null : attribute.id)}
                  >
                    {expanded === attribute.id ? "Close" : "Edit"}
                  </button>
                </div>

                {/* The three switches carry no help text of their own.
                    What each means is said once, in the legend above the
                    list — repeating three paragraphs on every card turned
                    a screen of forty questions into a wall of the same
                    prose forty times over, and the labels are the part an
                    operator reads on the row. */}
                <div className={styles.switches}>
                  <Switch
                    checked={attribute.filterable}
                    disabled={busy}
                    label="Buyers can filter by it"
                    onChange={(next) => void run(() => updateAttribute(attribute.id, { filterable: next }))}
                  />
                  <Switch
                    checked={attribute.trustSensitive}
                    disabled={busy}
                    label="Never auto-filled"
                    onChange={(next) => void run(() => updateAttribute(attribute.id, { trustSensitive: next }))}
                  />
                  <Switch
                    checked={attribute.material}
                    disabled={busy}
                    label="Needs re-approval"
                    onChange={(next) => void run(() => updateAttribute(attribute.id, { material: next }))}
                  />
                </div>

                {expanded === attribute.id ? (
                  <div className={styles.panel}>
                    {attribute.kind === "single" || attribute.kind === "multi" ? (
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Answers</h3>
                        {attribute.options.length === 0 ? (
                          <p className={styles.empty}>No answers yet — a pick-one question with none cannot be answered.</p>
                        ) : (
                          <ul className={styles.options}>
                            {attribute.options.map((option) => (
                              <li key={option.id} className={styles.option}>
                                {option.hex ? (
                                  <span
                                    className={styles.swatch}
                                    style={{ background: option.hex }}
                                    aria-hidden
                                  />
                                ) : null}
                                {option.label}
                                <span className={styles.key}>{option.value}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <FieldGrid columns={2}>
                          <Field label="Add an answer">
                            <Input
                              value={optionDraft.label}
                              maxLength={80}
                              onChange={(event) =>
                                setOptionDraft({ ...optionDraft, label: event.target.value })
                              }
                              placeholder="e.g. Beeswax"
                            />
                          </Field>
                          <Field
                            label="Its value"
                            hint="Never renamed — stored answers point at it."
                          >
                            <Input
                              value={optionDraft.value}
                              maxLength={64}
                              onChange={(event) =>
                                setOptionDraft({ ...optionDraft, value: event.target.value })
                              }
                              placeholder="beeswax"
                            />
                          </Field>
                        </FieldGrid>
                        <Button
                          size="sm"
                          disabled={busy || !optionDraft.label.trim() || !optionDraft.value.trim()}
                          onClick={() =>
                            void run(async () => {
                              await addAttributeOption(attribute.id, {
                                value: optionDraft.value.trim(),
                                label: optionDraft.label.trim(),
                              });
                              setOptionDraft({ value: "", label: "" });
                            })
                          }
                        >
                          Add answer
                        </Button>
                      </section>
                    ) : null}

                    <section className={styles.section}>
                      <h3 className={styles.sectionTitle}>Which shelves ask it</h3>
                      {/* A subcategory inherits its parent's questions, so
                          setting a department reaches everything under it —
                          which is why the list shows both and an admin
                          usually only touches the department. */}
                      <p className={styles.hint}>
                        Setting this on a top-level shelf asks it on every subcategory under it too.
                        Turning it off leaves the answers makers have already given.
                      </p>
                      <ul className={styles.shelves}>
                        {shelves.map((shelf) => (
                          <li key={shelf.id} className={styles.shelf}>
                            <span className={styles.shelfName}>{shelf.label}</span>
                            <Select
                              dense
                              aria-label={`How strongly ${shelf.label} asks ${attribute.label}`}
                              value={requirementOn(attribute, shelf.id)}
                              disabled={busy}
                              onChange={(event) => {
                                const next = event.target.value as AttributeRequirement | "none";
                                void run(() =>
                                  setShelfQuestion(shelf.id, attribute.id, next === "none" ? null : next),
                                );
                              }}
                            >
                              {REQUIREMENTS.map((requirement) => (
                                <option key={requirement.value} value={requirement.value}>
                                  {requirement.label}
                                </option>
                              ))}
                            </Select>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
