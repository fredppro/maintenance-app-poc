"use client";

import { useTranslations } from "next-intl";
import {
  ImageUploadField,
  type ImageUploadValue,
} from "@/features/files/ui/image-upload-field";
import {
  resizeImage,
  uploadImage,
  type ImageUploadProgress,
} from "@/features/files/client/image";
import type { ImageUploadErrorKey } from "@/features/files/client/image";

const MAX_EDGE = 640;

export type EquipmentImageValue = ImageUploadValue;

/** Uploads a pending equipment photo and returns its stored file id. */
export function uploadEquipmentImage(
  blob: Blob,
  onProgress?: ImageUploadProgress,
): Promise<string> {
  return uploadImage(blob, "equipment.jpg", onProgress);
}

export function EquipmentImageField({
  value,
  onChange,
  disabled,
  uploading,
  uploadProgress,
  uploadError,
  onUploadErrorClear,
}: {
  value: EquipmentImageValue;
  onChange: (value: EquipmentImageValue) => void;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number | null;
  uploadError?: ImageUploadErrorKey | null;
  onUploadErrorClear?: () => void;
}) {
  const t = useTranslations("Grid");

  return (
    <ImageUploadField
      id="equipment-image"
      value={value}
      onChange={onChange}
      onUploadErrorClear={onUploadErrorClear}
      prepareImage={(file) =>
        resizeImage(file, { maxEdge: MAX_EDGE, type: "image/jpeg" })
      }
      labels={{
        choose: t("uploadImage"),
        replace: t("replaceImage"),
        remove: t("removeImage"),
        emptyTitle: t("noImageTitle"),
        emptyDescription: t("imageDropHint"),
        imageAlt: t("equipmentImage"),
        noImage: t("equipmentImage"),
      }}
      disabled={disabled}
      uploading={uploading}
      uploadProgress={uploadProgress}
      uploadError={uploadError}
    />
  );
}
