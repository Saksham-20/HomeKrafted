"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { ApiError } from "@/lib/api/http";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_MB,
  uploadImage,
  type UploadPurpose,
} from "@/lib/api/uploads";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./ImageUpload.module.css";

export interface ImageUploadProps {
  /** Current image URL, or empty. Controlled — the parent owns the value. */
  value: string;
  onChange: (url: string) => void;
  /** Server-side folder + validation context. */
  purpose: UploadPurpose;
  label?: string;
  hint?: string;
  /** Preview aspect ratio — match the shape the image renders at downstream. */
  ratio?: string;
  /** Circular preview, for avatars. */
  shape?: "rect" | "square" | "circle";
  /** Placeholder caption when empty, reusing the `ImageSlot` convention. */
  placeholderLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag-and-drop (or click, or paste) image upload.
 *
 * Three ways in, because they suit different people: dropping a file is
 * fastest on a desktop with a folder open, the click-through file picker
 * is the only one that works on a phone, and paste catches the
 * screenshot-and-crop workflow. All three land on `handleFile`.
 *
 * **The drag counter is not incidental.** `dragleave` fires when the
 * pointer crosses onto a *child* element, so a naive
 * `dragenter`/`dragleave` pair makes the highlight flicker as the cursor
 * moves over the icon or the text inside the zone. Counting enters against
 * leaves is the standard fix, and `dragover` must call `preventDefault()`
 * or the browser navigates to the dropped file instead of giving it to us.
 *
 * Validation is duplicated on purpose: the type/size check here is UX
 * (instant feedback, no wasted upload), and the server re-derives both
 * from the bytes because anything the browser says can be forged.
 */
export function ImageUpload({
  value,
  onChange,
  purpose,
  label = "Image",
  hint,
  ratio = "1/1",
  shape = "rect",
  placeholderLabel = "No image yet",
  disabled = false,
  className,
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || disabled) return;
      setError(null);

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError("Use a JPEG, PNG, WebP or AVIF image.");
        return;
      }

      setBusy(true);
      setPercent(0);
      try {
        const uploaded = await uploadImage(file, purpose, { onProgress: setPercent });
        onChange(uploaded.url);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : "ERROR";
        if (code === "FILE_TOO_LARGE")
          setError(`That image is too large — keep it under ${MAX_UPLOAD_MB}MB.`);
        else if (code === "UNSUPPORTED_IMAGE") setError("That file isn't an image we can accept.");
        else if (code === "UNAUTHORIZED") setError("Your session expired — sign in again.");
        else setError(err instanceof ApiError ? err.message : "Upload failed. Try again.");
      } finally {
        setBusy(false);
        setPercent(0);
      }
    },
    [disabled, onChange, purpose],
  );

  // Paste-to-upload, scoped to when the zone has focus — a document-level
  // paste listener would hijack every Ctrl+V on the page, including into
  // the text inputs sitting next to this one.
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;

    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) {
        event.preventDefault();
        void handleFile(file);
      }
    }

    zone.addEventListener("paste", onPaste);
    return () => zone.removeEventListener("paste", onPaste);
  }, [handleFile]);

  function onDragEnter(event: React.DragEvent) {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    void handleFile(event.dataTransfer.files?.[0]);
  }

  const hasImage = Boolean(value);

  return (
    <div className={clsx(styles.wrap, className)}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        {hasImage && !busy && (
          <button
            type="button"
            className={styles.removeLink}
            onClick={() => {
              onChange("");
              setError(null);
            }}
            disabled={disabled}
          >
            <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
            Remove
          </button>
        )}
      </div>

      <div
        ref={zoneRef}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label={`${label} — drop an image, or press Enter to browse`}
        aria-busy={busy}
        aria-disabled={disabled}
        className={clsx(
          styles.zone,
          dragging && styles.dragging,
          hasImage && styles.filled,
          disabled && styles.disabled,
          error && styles.errored,
        )}
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled && !busy) inputRef.current?.click();
          }
        }}
      >
        <div className={styles.preview} data-shape={shape}>
          <ImageSlot
            ratio={ratio}
            shape={shape}
            label={placeholderLabel}
            src={value || undefined}
            compact
          />
        </div>

        <div className={styles.zoneBody}>
          {busy ? (
            <>
              <Loader2 size={20} strokeWidth={1.8} className={styles.spinner} aria-hidden="true" />
              <span className={styles.zoneTitle}>Uploading… {percent}%</span>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className={styles.progressBar} style={{ width: `${percent}%` }} />
              </div>
            </>
          ) : (
            <>
              {hasImage ? (
                <ImagePlus size={20} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <UploadCloud size={20} strokeWidth={1.8} aria-hidden="true" />
              )}
              <span className={styles.zoneTitle}>
                {hasImage ? "Drop a new image to replace" : "Drag an image here"}
              </span>
              <span className={styles.zoneHint}>
                {hint ?? `or click to browse · JPEG, PNG, WebP, AVIF · up to ${MAX_UPLOAD_MB}MB`}
              </span>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className={styles.input}
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          disabled={disabled}
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            // Reset so picking the same file twice in a row still fires
            // `change` — otherwise a failed upload can't be retried from
            // the picker.
            event.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
