"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { Loader2, Plus, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { ApiError } from "@/lib/api/http";
import {
  ACCEPTED_IMAGE_TYPES,
  uploadImage,
  type UploadedImage,
  type UploadPurpose,
} from "@/lib/api/uploads";
import styles from "./PhotoUpload.module.css";

export interface PhotoUploadProps {
  /** Uploaded image URLs. Controlled — the parent owns the list. */
  photos: string[];
  onChange: (photos: string[]) => void;
  purpose: UploadPurpose;
  maxPhotos?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-photo upload — a grid of thumbnails plus a dashed "add" tile that
 * doubles as a drop zone.
 *
 * Sibling of `ImageUpload`, not a wrapper around it: that one owns a
 * single value with an inline preview, this one owns a list and lays out
 * as a grid. They share the upload call and the error vocabulary, which is
 * the part worth sharing; forcing one component to do both would mean a
 * mode flag threaded through every branch.
 *
 * Uploads run in parallel and are appended as they land, so dropping six
 * photos doesn't serialise into six round trips. `slice` caps the batch at
 * the remaining slots rather than rejecting the whole drop — dropping a
 * folder of ten when four fit should fill the four, not fail.
 */
export function PhotoUpload({
  photos,
  onChange,
  purpose,
  maxPhotos = 6,
  label = "Add photo",
  disabled = false,
  className,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const remaining = maxPhotos - photos.length;
  const canAddMore = remaining > 0 && !disabled;

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || disabled) return;
      setError(null);

      const files = Array.from(fileList)
        .filter((file) => ACCEPTED_IMAGE_TYPES.includes(file.type))
        .slice(0, remaining);

      if (files.length === 0) {
        setError("Use JPEG, PNG, WebP or AVIF images.");
        return;
      }

      setBusyCount((n) => n + files.length);
      const results = await Promise.allSettled(
        files.map((file) => uploadImage(file, purpose)),
      );
      setBusyCount((n) => Math.max(0, n - files.length));

      const uploaded = results
        .filter((r): r is PromiseFulfilledResult<UploadedImage> => r.status === "fulfilled")
        .map((r) => r.value.url);

      if (uploaded.length > 0) onChange([...photos, ...uploaded]);

      // Report the first failure rather than a count — with a handful of
      // files the reason is almost always the same for all of them.
      const failed = results.find((r) => r.status === "rejected");
      if (failed && failed.status === "rejected") {
        const reason: unknown = failed.reason;
        setError(
          reason instanceof ApiError ? reason.message : "Some photos didn't upload. Try again.",
        );
      }
    },
    [disabled, onChange, photos, purpose, remaining],
  );

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (canAddMore) void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className={className}>
      <div className={styles.grid}>
        {photos.map((photo, index) => (
          <div key={`${photo}-${index}`} className={styles.thumb}>
            <ImageSlot ratio="1/1" label={`Photo ${index + 1}`} src={photo} compact />
            <button
              type="button"
              className={styles.remove}
              onClick={() => onChange(photos.filter((_, i) => i !== index))}
              disabled={disabled}
              aria-label={`Remove photo ${index + 1}`}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        ))}

        {busyCount > 0 &&
          Array.from({ length: busyCount }).map((_, i) => (
            <div key={`pending-${i}`} className={clsx(styles.dropTile, styles.pending)}>
              <Loader2 size={18} strokeWidth={1.8} className={styles.spinner} aria-hidden="true" />
            </div>
          ))}

        {canAddMore && (
          <button
            type="button"
            className={clsx(styles.dropTile, dragging && styles.dragging)}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) {
                dragDepth.current = 0;
                setDragging(false);
              }
            }}
            onDrop={onDrop}
          >
            <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
          </button>
        )}
      </div>

      {/* Out of the tab order and out of the accessibility tree — the
          drop tile above is the control that carries the name and the key
          handlers. See the same comment in `ImageUpload`. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className={styles.input}
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        disabled={disabled}
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
