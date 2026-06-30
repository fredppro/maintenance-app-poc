import { PassThrough } from "node:stream";
import PDFDocument from "pdfkit";
import { MaintenanceEntry } from "../../../lib/scheduler-types";
import enMessages from "../../../messages/en.json";
import ptMessages from "../../../messages/pt-pt.json";
import { renderMaintenanceReport } from "./renderer";

const messagesMap: Record<string, typeof enMessages> = {
  en: enMessages,
  "pt-pt": ptMessages,
};

export function createMaintenanceReportPDFStream(
  entry: MaintenanceEntry,
  locale = "en",
) {
  const normalizedLocale =
    locale && messagesMap[locale.toLowerCase()]
      ? locale.toLowerCase()
      : "en";

  const t = messagesMap[normalizedLocale].PDF;
  const dateLocale = normalizedLocale === "pt-pt" ? "pt-PT" : "en-US";

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