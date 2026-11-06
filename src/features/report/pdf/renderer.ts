import { MaintenanceEntry } from "@/features/scheduler/types";
import {
  formatWorkerDurationInHours,
  formatWorkerWorkDuration,
} from "@/features/scheduler/utils/worker-hours";
import enMessages from "@/i18n/messages/en.json";

type ReportTranslations = typeof enMessages.PDF;

/**
 * PURE RENDERER
 * - no IO
 * - no buffering
 * - no stream handling
 * - only draws into PDFDocument
 */
function renderMaintenanceReport(
  doc: PDFKit.PDFDocument,
  entry: MaintenanceEntry,
  t: ReportTranslations,
  dateLocale: string,
  timeZone?: string,
) {
  // 1. Header Block (Company Information & Vector Logo)
  // Vector logo: Draw a beautiful slate-colored industrial gear
  doc.save();
  doc.translate(36, 40);
  doc.fillColor("#475569"); // slate-600
  doc.strokeColor("#475569");

  // Draw outer circle
  doc.circle(12, 12, 8).lineWidth(2.5).stroke();
  // Draw inner solid circle
  doc.circle(12, 12, 3).fill();

  // Draw gear teeth (8 teeth)
  for (let i = 0; i < 8; i++) {
    doc.save();
    doc.translate(12, 12);
    doc.rotate((i * 45 * Math.PI) / 180);
    doc.rect(-2, -11, 4, 3).fill();
    doc.restore();
  }
  doc.restore();

  // Business Name & Tagline
  doc
    .fillColor("#0f172a") // slate-900
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("MANUSIST", 70, 42);

  doc
    .fillColor("#64748b") // slate-500
    .font("Helvetica")
    .fontSize(8)
    .text(t.tagline, 70, 58);

  // Business Metadata on the top right
  doc
    .fillColor("#475569") // slate-600
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("Manusist, Lda.", 399, 40, { align: "right", width: 160 })
    .font("Helvetica")
    .text("NIF: 500 123 456", 399, 50, { align: "right", width: 160 })
    .text("Rua do Progresso, 123, 1000-001 Lisboa", 399, 60, {
      align: "right",
      width: 160,
    })
    .text("geral@manusist.pt | +351 210 000 000", 399, 70, {
      align: "right",
      width: 160,
    });

  // Divider rule
  doc
    .moveTo(36, 85)
    .lineTo(559, 85)
    .lineWidth(1)
    .strokeColor("#cbd5e1") // slate-300
    .stroke();

  // Title & Document metadata
  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(t.headerTitle, 36, 95);

  const generationTime = new Date().toLocaleString(dateLocale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc
    .fillColor("#64748b")
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      `${t.recordId}: #${entry.id.substring(0, 8).toUpperCase()}`,
      399,
      95,
      { align: "right", width: 160 },
    )
    .text(`${t.issuedAt}: ${generationTime}`, 399, 107, {
      align: "right",
      width: 160,
    });

  let currentY = 130;
  const PAGE_CONTENT_BOTTOM = 770;

  const startNewPage = () => {
    doc.addPage();
    currentY = 50;
  };

  // Section Title Helper
  const drawSectionHeader = (title: string, y: number): number => {
    doc
      .fillColor("#f1f5f9") // slate-100 banner
      .rect(36, y, 523, 18)
      .fill();

    doc
      .fillColor("#1e293b") // slate-800
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(title.toUpperCase(), 44, y + 5);

    doc
      .moveTo(36, y + 18)
      .lineTo(559, y + 18)
      .lineWidth(1)
      .strokeColor("#cbd5e1")
      .stroke();

    return y + 24;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString(dateLocale, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 2. Section 1: Equipment Details
  currentY = drawSectionHeader(t.sections.equipmentDetails, currentY);

  // Left Column (Equipment metadata)
  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.equipment.label, 36, currentY);
  doc
    .fillColor("#0f172a")
    .font("Helvetica")
    .fontSize(8.5)
    .text(entry.equipment?.name || "N/A", 36, currentY + 11, { width: 240 });

  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.equipment.category, 36, currentY + 28);
  doc
    .fillColor("#0f172a")
    .font("Helvetica")
    .fontSize(8.5)
    .text(entry.equipment?.category || "N/A", 36, currentY + 39, {
      width: 240,
    });

  // Right Column (IDs and status)
  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.equipment.code, 300, currentY);
  doc
    .fillColor("#0f172a")
    .font("Helvetica")
    .fontSize(8.5)
    .text(entry.equipment?.id || "N/A", 300, currentY + 11, { width: 240 });

  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.equipment.status, 300, currentY + 28);

  // Status Badge translation & design
  const statusText =
    t.status[entry.status as keyof typeof t.status] ||
    entry.status.toUpperCase();

  const statusColors: Record<string, { bg: string; text: string }> = {
    scheduled: { bg: "#f1f5f9", text: "#475569" },
    "in-progress": { bg: "#fff7ed", text: "#c2410c" },
    completed: { bg: "#f0fdf4", text: "#15803d" },
  };
  const colors = statusColors[entry.status] || {
    bg: "#f1f5f9",
    text: "#475569",
  };

  doc.save();
  doc
    .fillColor(colors.bg)
    .rect(300, currentY + 38, 75, 14)
    .fill();
  doc
    .fillColor(colors.text)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text(statusText, 300, currentY + 41, { width: 75, align: "center" });
  doc.restore();

  if (entry.completedAt) {
    doc
      .fillColor("#64748b")
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(t.equipment.completedAt, 300, currentY + 55);
    doc
      .fillColor("#0f172a")
      .font("Helvetica")
      .fontSize(8.5)
      .text(formatDate(entry.completedAt), 300, currentY + 65, {
        width: 240,
      });
  }
  currentY += entry.completedAt ? 82 : 62;

  const formatWorkTime = (date: Date | string | null | undefined) => {
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      return t.labor.notRecorded;
    }
    return formatDate(date);
  };

  const formatWorkDate = (date: Date | string) => {
    const parsedDate = new Date(date);
    if (!Number.isFinite(parsedDate.getTime())) {
      return t.labor.notRecorded;
    }
    return parsedDate.toLocaleDateString(dateLocale, {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const drawLaborTableHeader = () => {
    doc
      .fillColor("#f8fafc")
      .rect(36, currentY, 523, 14)
      .fill();

    doc
      .fillColor("#475569")
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(t.labor.technician, 42, currentY + 3)
      .text(t.labor.start, 240, currentY + 3)
      .text(t.labor.end, 360, currentY + 3)
      .text(t.labor.duration, 470, currentY + 3, {
        align: "right",
        width: 80,
      });

    doc
      .moveTo(36, currentY + 14)
      .lineTo(559, currentY + 14)
      .lineWidth(0.5)
      .strokeColor("#cbd5e1")
      .stroke();

    currentY += 14;
  };

  // 3. Section 2: Labor & Duration
  currentY = drawSectionHeader(t.sections.labor, currentY);
  drawLaborTableHeader();

  const assignments = entry.assignments ?? [];
  const dailyHours = entry.dailyHours ?? [];
  const workersWithWorkLogs = new Set(
    dailyHours.map((workLog) => workLog.workerId),
  );
  const laborRows = [
    ...dailyHours.map((workLog) => {
      const startTime = workLog.startTime
        ? new Date(workLog.startTime)
        : null;
      const hasStartTime =
        startTime !== null && Number.isFinite(startTime.getTime());
      const durationHours = Number(workLog.hours);
      const endTime =
        hasStartTime &&
        Number.isFinite(durationHours) &&
        durationHours > 0
          ? new Date(startTime.getTime() + durationHours * 60 * 60 * 1000)
          : null;

      return {
        workerName:
          workLog.worker?.name ??
          assignments.find(({ workerId }) => workerId === workLog.workerId)
            ?.worker.name ??
          t.labor.notRecorded,
        start: hasStartTime
          ? formatWorkTime(startTime)
          : formatWorkDate(workLog.workDate),
        end: formatWorkTime(endTime),
        duration:
          formatWorkerDurationInHours(durationHours) ?? t.labor.notRecorded,
      };
    }),
    ...assignments
      .filter(({ workerId }) => !workersWithWorkLogs.has(workerId))
      .map((assignment) => ({
        workerName: assignment.worker.name,
        start: formatWorkTime(assignment.startTime),
        end: formatWorkTime(assignment.endTime),
        duration:
          formatWorkerWorkDuration(
            assignment.startTime,
            assignment.endTime,
          ) ?? t.labor.notRecorded,
      })),
  ];

  if (laborRows.length > 0) {
    laborRows.forEach((row, index) => {
      if (currentY + 16 > PAGE_CONTENT_BOTTOM) {
        startNewPage();
        currentY = drawSectionHeader(t.sections.labor, currentY);
        drawLaborTableHeader();
      }

      if (index % 2 === 1) {
        doc.fillColor("#f8fafc").rect(36, currentY, 523, 16).fill();
      }

      doc
        .fillColor("#0f172a")
        .font("Helvetica")
        .fontSize(8)
        .text(row.workerName, 42, currentY + 4, {
          width: 190,
          lineBreak: false,
        })
        .text(row.start, 240, currentY + 4)
        .text(row.end, 360, currentY + 4)
        .font("Helvetica-Bold")
        .text(row.duration, 470, currentY + 4, {
          align: "right",
          width: 80,
        });

      doc
        .moveTo(36, currentY + 16)
        .lineTo(559, currentY + 16)
        .lineWidth(0.5)
        .strokeColor("#e2e8f0")
        .stroke();

      currentY += 16;
    });
  } else {
    if (currentY + 16 > PAGE_CONTENT_BOTTOM) {
      startNewPage();
      currentY = drawSectionHeader(t.sections.labor, currentY);
      drawLaborTableHeader();
    }

    doc
      .fillColor("#64748b")
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(t.labor.noWorkers, 42, currentY + 4);
    currentY += 16;
  }

  currentY += 10;

  const drawMaterialsTableHeader = () => {
    doc.fillColor("#f8fafc").rect(36, currentY, 523, 14).fill();

    doc
      .fillColor("#475569")
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(t.materials.item, 42, currentY + 3)
      .text(t.materials.reference, 242, currentY + 3)
      .text(t.materials.quantity, 332, currentY + 3, {
        align: "right",
        width: 70,
      })
      .text(t.materials.unit, 402, currentY + 3, {
        align: "center",
        width: 60,
      })
      .text(t.materials.price, 472, currentY + 3, {
        align: "right",
        width: 80,
      });

    doc
      .moveTo(36, currentY + 14)
      .lineTo(559, currentY + 14)
      .lineWidth(0.5)
      .strokeColor("#cbd5e1")
      .stroke();

    currentY += 14;
  };

  if (currentY + 38 > PAGE_CONTENT_BOTTOM) startNewPage();

  // 4. Section 3: Materials Utilized
  currentY = drawSectionHeader(t.sections.materialsUtilized, currentY);
  drawMaterialsTableHeader();

  if (entry.materials && entry.materials.length > 0) {
    entry.materials.forEach((material, index) => {
      if (currentY + 16 > PAGE_CONTENT_BOTTOM) {
        startNewPage();
        currentY = drawSectionHeader(t.sections.materialsUtilized, currentY);
        drawMaterialsTableHeader();
      }

      if (index % 2 === 1) {
        doc.fillColor("#f8fafc").rect(36, currentY, 523, 16).fill();
      }

      const formattedPrice =
        material.price != null
          ? material.price.toFixed(2)
          : "—";

      doc
        .fillColor("#0f172a")
        .font("Helvetica")
        .fontSize(8)
        .text(material.name, 42, currentY + 4, { width: 200, lineBreak: false })
        .text(material.reference || "-", 242, currentY + 4, {
          width: 140,
          lineBreak: false,
        })
        .font("Helvetica-Bold")
        .text(String(material.quantity), 332, currentY + 4, {
          align: "right",
          width: 70,
        })
        .text(material.unit ?? "PC", 402, currentY + 4, {
          align: "center",
          width: 60,
        })
        .text(formattedPrice, 472, currentY + 4, {
          align: "right",
          width: 80,
        });

      doc
        .moveTo(36, currentY + 16)
        .lineTo(559, currentY + 16)
        .lineWidth(0.5)
        .strokeColor("#e2e8f0")
        .stroke();

      currentY += 16;
    });
  } else {
    if (currentY + 16 > PAGE_CONTENT_BOTTOM) {
      startNewPage();
      currentY = drawSectionHeader(t.sections.materialsUtilized, currentY);
      drawMaterialsTableHeader();
    }

    doc
      .fillColor("#64748b")
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(t.materials.noMaterials, 42, currentY + 4);
    currentY += 16;
  }

  currentY += 10;

  if (currentY + 100 > PAGE_CONTENT_BOTTOM) startNewPage();

  // 5. Section 4: Summary & Technical Overview
  currentY = drawSectionHeader(t.sections.technicalOverview, currentY);

  // Task Title & Intervention Type
  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.summary.title, 36, currentY);
  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(entry.title, 36, currentY + 11, { width: 240 });

  const typeText = t.types[entry.type as keyof typeof t.types] || entry.type;

  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.summary.type, 300, currentY);
  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(typeText, 300, currentY + 11, { width: 240 });

  currentY += 28;

  // Text block for descriptions
  doc
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(t.summary.notes, 36, currentY);

  const notes = entry.description || t.summary.noNotes;

  doc
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(8)
    .text(notes, 42, currentY + 14, { width: 511, align: "justify" });

  // Draw a neat bounding box around notes to separate it visually
  const textHeight = doc.heightOfString(notes, {
    width: 511,
    align: "justify",
  });
  const boxHeight = Math.max(textHeight + 12, 35);

  doc.save();
  doc
    .rect(36, currentY + 8, 523, boxHeight)
    .lineWidth(0.5)
    .strokeColor("#cbd5e1")
    .stroke();
  doc.restore();

  currentY += boxHeight + 15;

  // 6. Signatures block (Push to bottom if space permits, or make a new page if page overflows)
  if (currentY > 710) {
    doc.addPage();
    currentY = 50;
  }

  // Stick signature block to the bottom section of current page
  const sigY = Math.max(currentY, 715);

  // Signature lines
  doc
    .moveTo(36, sigY)
    .lineTo(210, sigY)
    .lineWidth(0.5)
    .strokeColor("#94a3b8") // slate-400
    .stroke();

  doc
    .moveTo(385, sigY)
    .lineTo(559, sigY)
    .lineWidth(0.5)
    .strokeColor("#94a3b8")
    .stroke();

  doc
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(7.5)
    .text(t.signatures.technician, 36, sigY + 5, {
      width: 174,
      align: "center",
    })
    .text(t.signatures.client, 385, sigY + 5, { width: 174, align: "center" });

  // Add footers with page numbering on all buffered pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    // Footer line
    doc
      .moveTo(36, 785)
      .lineTo(559, 785)
      .lineWidth(0.5)
      .strokeColor("#cbd5e1")
      .stroke();

    doc
      .fillColor("#94a3b8")
      .font("Helvetica")
      .fontSize(7)
      .text(t.footer.generatedBy, 36, 792)
      .text(
        `${t.footer.page} ${i + 1} ${t.footer.of} ${range.count}`,
        489,
        792,
        { align: "right", width: 70 },
      );
  }
}

export { renderMaintenanceReport };