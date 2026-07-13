"use client";

import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createWorker, updateWorker } from "@/lib/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

const workerTypes = ["INTERNAL", "EXTERNAL"] as const;

type FormValues = {
  name: string;
  email: string;
  phone?: string | null;
  type: (typeof workerTypes)[number];
};

type Props = {
  initialData?: {
    id?: string;
    name: string;
    email: string;
    phone?: string | null;
    type?: string;
  };
  onCancel: () => void;
  onSaved: () => void;
};

export default function CreateUpdateWorker({
  initialData,
  onCancel,
  onSaved,
}: Props) {
  const t = useTranslations("Workers");
  const tCommon = useTranslations("Common");
  const isEdit = Boolean(initialData?.id);

  const workerSchema = z.object({
    name: z.string().min(1, t("errorNameRequired")),
    email: z.string().email(t("errorInvalidEmail")),
    phone: z.string().optional(),
    type: z.enum(workerTypes),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      type: (initialData?.type as any) ?? "INTERNAL",
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
    <FormProvider {...form}>
      <form
        id="worker-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <FormItem>
          <FormLabel>{t("fieldName")}</FormLabel>
          <FormControl>
            <Input {...register("name")} />
          </FormControl>
          <FormMessage />
        </FormItem>

        <FormItem>
          <FormLabel>{t("fieldEmail")}</FormLabel>
          <FormControl>
            <Input {...register("email")} />
          </FormControl>
          <FormMessage />
        </FormItem>

        <FormItem>
          <FormLabel>{t("fieldPhone")}</FormLabel>
          <FormControl>
            <Input {...register("phone")} />
          </FormControl>
          <FormMessage />
        </FormItem>

        <FormItem>
          <FormLabel>{t("fieldWorkerType")}</FormLabel>
          <FormControl>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
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
          </FormControl>
          <FormMessage />
        </FormItem>
      </form>
    </FormProvider>
  );
}
