"use client";

import Image from "next/image";
import clsx from "clsx";
import { Check } from "lucide-react";
import { CHEF_CHARACTERS, isChefCharacter } from "@/lib/avatars/chef-characters";
import styles from "./CharacterPicker.module.css";

export interface CharacterPickerProps {
  /** Heading over the grid. Defaults to the HomeKrafter wording. */
  legend?: string;
  /** The sentence under it — a shopper is not choosing a shop photo, so the copy is the caller's. */
  lead?: string;
  /**
   * Radio-group name. Only matters when two pickers share a page; the
   * default is fine everywhere it is used today.
   */
  name?: string;
  /** The stored `avatarSrc` — a character, an uploaded photo, or nothing. */
  value: string;
  onChange: (src: string) => void;
}

/**
 * "Or pick a character" — the second-best answer to a kitchen with no
 * photograph, offered underneath the upload rather than beside it.
 *
 * **The order of the two controls is the argument.** A photo of the
 * person who cooked your food is the whole pitch of the platform; a
 * drawing is what stands in until there is one. So the upload is above
 * this, this says "or", and choosing a character never hides the upload.
 *
 * **Radio semantics, drawn as a grid.** Sixteen mutually exclusive
 * choices are a radio group, and building it out of `<button>`s would
 * lose arrow-key movement between them and the "3 of 16" a screen
 * reader announces. Each cell is a real `<input type="radio">` with the
 * label doing the drawing, so the browser's own roving focus applies and
 * there is no keyboard code here to get wrong.
 *
 * **The character is not a badge.** Nothing about picking one is
 * verified, said to a buyer, or read by anything but the avatar slot —
 * it is a picture, and the copy under the grid says so.
 */
export function CharacterPicker({
  value,
  onChange,
  legend = "Or pick a character",
  lead = "No photo yet? Choose someone to stand in. You can swap it for a real photo whenever you like — a photo of you is what buyers trust most.",
  name = "hk-character",
}: CharacterPickerProps) {
  const selected = isChefCharacter(value) ? value : undefined;

  return (
    <fieldset className={styles.wrap}>
      <legend className={styles.legend}>{legend}</legend>
      <p className={styles.lead}>{lead}</p>

      <div className={styles.grid}>
        {CHEF_CHARACTERS.map((character) => {
          const isSelected = selected === character.src;
          return (
            <label
              key={character.id}
              className={clsx(styles.cell, isSelected && styles.cellSelected)}
            >
              <input
                type="radio"
                name={name}
                className={styles.radio}
                value={character.src}
                checked={isSelected}
                onChange={() => onChange(character.src)}
              />
              <Image
                src={character.src}
                alt={character.label}
                width={72}
                height={72}
                className={styles.face}
                /* A 72px cell — say so, or the browser fetches a
                   viewport-wide image for a thumbnail. */
                sizes="72px"
              />
              <span className={styles.tick} aria-hidden="true">
                <Check size={13} strokeWidth={3} />
              </span>
            </label>
          );
        })}
      </div>

      {selected && (
        <button type="button" className={styles.clear} onClick={() => onChange("")}>
          Use no picture
        </button>
      )}
    </fieldset>
  );
}
