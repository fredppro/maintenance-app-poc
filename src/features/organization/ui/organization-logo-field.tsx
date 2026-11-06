"use client";

import { useTranslations } from "next-intl";
import {
  ImageUploadField,
  type ImageUploadValue,
} from "@/features/files/ui/image-upload-field";
import {
  resizeImage,
  type ImageUploadErrorKey,
} from "@/features/files/client/image";

const LOGO_MAX_EDGE = 512;

export type OrganizationLogoValue = ImageUploadValue;

export function OrganizationLogoField({
  id,
  name,
  value,
  onChange,
  disabled,
  uploading,
  uploadProgress,
  uploadError,
  onUploadErrorClear,
  ariaInvalid,
  ariaDescribedBy,
}: {
  id: string;
  name: string;
  value: OrganizationLogoValue;
  onChange: (value: OrganizationLogoValue) => void;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number | null;
  uploadError?: ImageUploadErrorKey | null;
  onUploadErrorClear?: () => void;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}) {
  const t = useTranslations("OrganizationSettings");

  return (
    <ImageUploadField
      id={id}
      value={value}
      onChange={onChange}
      onUploadErrorClear={onUploadErrorClear}
      prepareImage={(file) =>
        resizeImage(file, {
          maxEdge: LOGO_MAX_EDGE,
          type: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
        })
      }
      labels={{
        choose: t("logoUpload"),
        replace: t("logoReplace"),
        remove: t("logoRemove"),
        emptyTitle: t("logoEmptyTitle"),
        emptyDescription: t("logoDropHint"),
        imageAlt: t("logoAlt", { name }),
        noImage: t("logoNone"),
      }}
      disabled={disabled}
      uploading={uploading}
      uploadProgress={uploadProgress}
      uploadError={uploadError}
      ariaInvalid={ariaInvalid}
      ariaDescribedBy={ariaDescribedBy}
    />
  );
}
