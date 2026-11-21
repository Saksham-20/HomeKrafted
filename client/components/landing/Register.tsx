"use client";

import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import { PickShelf, type PickItem } from "./PickShelf";
import {
  REGISTER_MORE,
  registerView,
  type RegisterFilter,
  type RegisterList,
  type RegisterLists,
} from "@/lib/landing/register";
import styles from "./Register.module.css";

const FILTERS: Array<{ id: RegisterFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "gifts", label: "Gifts" },
  { id: "food", label: "Food" },
  { id: "combos", label: "Combos" },
];

export interface RegisterProps {
  lists: RegisterLists;
  vendorNames: Record<string, string>;
}

/** The weight a card shows: the default size, else the first. */
function toPlate(product: Product, vendorNames: Record<string, string>): PickItem {
  const weight =
    product.weightOptions.find((option) => option.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  const paid = weight?.salePrice ?? weight?.price ?? 0;
  return {
    id: product.id,
    href: `/product/${product.slug}`,
    src: product.images[0]?.src,
    name: product.name,
    maker: vendorNames[product.vendorId] ?? "Homekrafted",
    price: formatCurrency(paid),
    was: weight && paid < weight.price ? formatCurrency(weight.price) : undefined,
  };
}

/**
 * This week's bestsellers and trending listings as photo panels (`PickShelf`): all five at once, the pointed-at one opens wide. The list switch and the filters are plain controls above
 * it (the filters are a real tab set — arrow keys, Home/End, one panel).
 */
export function Register({ lists, vendorNames }: RegisterProps) {
  const [list, setList] = useState<RegisterList>("bestsellers");
  const [filter, setFilter] = useState<RegisterFilter>("all");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const view = registerView(lists, list, filter);
  const more = REGISTER_MORE[filter];
  const hasAny =
    lists.bestsellers.food.length + lists.bestsellers.craft.length + lists.trending.food.length +
      lists.trending.craft.length >
    0;

  if (!hasAny) return null;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = FILTERS.length - 1;
    let next = index;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    setFilter(FILTERS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-register-title">
      <div className="container">
        <div className={styles.head}>
          <div>
            <h2 id="lp-register-title" className={styles.title}>
              Best of this week
            </h2>
            <div className={styles.switch} role="group" aria-label="Which list">
              {(["bestsellers", "trending"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={clsx(styles.switchBtn, list === item && styles.switchOn)}
                  aria-pressed={list === item}
                  onClick={() => setList(item)}
                >
                  {item === "bestsellers" ? "Bestsellers" : "Trending"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.controls}>
            <div role="tablist" aria-label="Filter this week's listings" className={styles.tabs}>
              {FILTERS.map((item, index) => (
                <button
                  key={item.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`lp-register-tab-${item.id}`}
                  aria-selected={filter === item.id}
                  aria-controls="lp-register-panel"
                  tabIndex={filter === item.id ? 0 : -1}
                  className={clsx(styles.tab, filter === item.id && styles.tabOn)}
                  onClick={() => setFilter(item.id)}
                  onKeyDown={(event) => onTabKey(event, index)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Link href={more.href} className={styles.more}>
              {more.label}
              <ArrowRight className={styles.moreIcon} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div
          id="lp-register-panel"
          role="tabpanel"
          aria-labelledby={`lp-register-tab-${filter}`}
          className={styles.panel}
        >
          {view.length > 0 ? (
            <PickShelf
              items={view.map((product) => toPlate(product, vendorNames))}
              label={`${list === "trending" ? "Trending" : "Bestselling"} listings`}
            />
          ) : (
            <p className={styles.empty}>
              Nothing {list === "trending" ? "trending" : "selling"} under this filter yet —{" "}
              <Link href={more.href}>{more.label.toLowerCase()}</Link>.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
