import { APPLICATION_LOCALES } from "@/i18n/config";
import { AppLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { PassThrough } from "node:stream";
import PDFDocument from "pdfkit";
import { MaintenanceEntry } from "../../../lib/scheduler-types";
import enMessages from "../../../messages/en.json";
import ptMessages from "../../../messages/pt-pt.json";
import { renderMaintenanceReport } from "./renderer";

const messagesMap: Record<AppLocale, typeof enMessages> = {
  en: enMessages,
  "pt-pt": ptMessages,
};

export function createMaintenanceReportPDFStream(
  entry: MaintenanceEntry,
  locale: AppLocale = routing.defaultLocale,
) {
 
  const t = messagesMap[locale].PDF;
  const dateLocale = APPLICATION_LOCALES[locale].dateLocale.code ?? routing.defaultLocale;

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    bufferPages: true,
  });

  const stream = new PassThrough();

  doc.pipe(stream);

  try {
    renderMaintenanceReport(doc, entry, t, dateLocale);
    doc.end();
  } catch (err) {
    stream.destroy(err as Error);
  }

  return stream;
}