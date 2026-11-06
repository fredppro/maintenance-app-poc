"use client";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createWorker, updateWorker } from "../server/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const workerTypes = ["INTERNAL", "EXTERNAL"] as const;

type Props = {
  initialData?: {
    id?: string;
    name: string;
    email: string;
    phone?: string | null;
    type?: string;
  };
  onSaved: () => void;
};

export default function CreateUpdateWorker({
  initialData,
  onSaved,
}: Props) {
  const t = useTranslations("Workers");
  const isEdit = Boolean(initialData?.id);

  const workerSchema = z.object({
    name: z.string().min(1, t("errorNameRequired")),
    email: z.string().email(t("errorInvalidEmail")),
    phone: z.string().optional(),
    type: z.enum(workerTypes),
  });
  type FormInput = z.input<typeof workerSchema>;
  type FormValues = z.output<typeof workerSchema>;

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      type: initialData?.type === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
    },
  });

  const { control, register, handleSubmit, formState } = form;

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEdit && initialData?.id) {
        await updateWorker(initialData.id, data);
      } else {
        await createWorker(data);
      }
      onSaved();
    } catch (err) {
      console.error(err);
      alert(t("failedSave"));
    }
  };

  return (
    <form
      id="worker-form"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={!!formState.errors.name || undefined}>
          <FieldLabel htmlFor="worker-name">{t("fieldName")}</FieldLabel>
          <Input
            id="worker-name"
            aria-required="true"
            aria-invalid={!!formState.errors.name || undefined}
            aria-describedby={
              formState.errors.name ? "worker-name-error" : undefined
            }
            {...register("name")}
          />
          <FieldError id="worker-name-error">
            {formState.errors.name?.message}
          </FieldError>
        </Field>

        <Field data-invalid={!!formState.errors.email || undefined}>
          <FieldLabel htmlFor="worker-email">{t("fieldEmail")}</FieldLabel>
          <Input
            id="worker-email"
            type="email"
            aria-required="true"
            aria-invalid={!!formState.errors.email || undefined}
            aria-describedby={
              formState.errors.email ? "worker-email-error" : undefined
            }
            {...register("email")}
          />
          <FieldError id="worker-email-error">
            {formState.errors.email?.message}
          </FieldError>
        </Field>

        <Field data-invalid={!!formState.errors.phone || undefined}>
          <FieldLabel htmlFor="worker-phone">{t("fieldPhone")}</FieldLabel>
          <Input
            id="worker-phone"
            aria-invalid={!!formState.errors.phone || undefined}
            aria-describedby={
              formState.errors.phone ? "worker-phone-error" : undefined
            }
            {...register("phone")}
          />
          <FieldError id="worker-phone-error">
            {formState.errors.phone?.message}
          </FieldError>
        </Field>

        <Field data-invalid={!!formState.errors.type || undefined}>
          <FieldLabel htmlFor="worker-type">{t("fieldWorkerType")}</FieldLabel>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger
                  id="worker-type"
                  aria-required="true"
                  aria-invalid={!!formState.errors.type || undefined}
                  aria-describedby={
                    formState.errors.type ? "worker-type-error" : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workerTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(type.toLowerCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="worker-type-error">
            {formState.errors.type?.message}
          </FieldError>
        </Field>
      </FieldGroup>
    </form>
  );
}
