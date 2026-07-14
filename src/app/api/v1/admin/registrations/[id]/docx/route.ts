import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  UnderlineType,
} from 'docx';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import { formatDateVN, formatDateTimeVN, toTitleCaseName } from '@/lib/format';

// ─── Status labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  no_show: 'Vắng mặt',
};

// Default document font. Times New Roman is available on virtually every
// Windows/Office install, so declaring it by name (docx does not embed fonts)
// renders the .docx in Times New Roman without shipping any font files.
const DEFAULT_FONT = 'Times New Roman';

// ─── Vietnamese administrative document header (công văn format) ────────────

const NONE_BORDER = { style: BorderStyle.NONE, size: 0 };
const NO_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
} as const;

/**
 * Builds the two-column header used in Vietnamese government documents.
 *
 * Left column:   TRẠI TẠM GIAM TRIỆU PHONG  (bold)
 *                PHÂN TRẠI TẠM GIAM SỐ 1     (bold, underlined)
 *
 * Right column:  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM  (bold)
 *                Độc lập – Tự do – Hạnh phúc              (bold, italic, underlined)
 */
function buildAdministrativeHeader(): Table {
  return new Table({
    rows: [
      new TableRow({
        children: [
          // ── Left column ──
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'TRẠI TẠM GIAM TRIỆU PHONG',
                    bold: true,
                    size: 24,
                    font: DEFAULT_FONT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'PHÂN TRẠI TẠM GIAM SỐ 1',
                    bold: true,
                    size: 22,
                    font: DEFAULT_FONT,
                    underline: { type: UnderlineType.SINGLE },
                  }),
                ],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
          }),

          // ── Right column ──
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                    bold: true,
                    size: 24,
                    font: DEFAULT_FONT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Độc lập – Tự do – Hạnh phúc',
                    bold: true,
                    size: 24,
                    font: DEFAULT_FONT,
                    underline: { type: UnderlineType.SINGLE },
                  }),
                ],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
          }),
        ],
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
  });
}

// ─── Helper: create a table cell with consistent styling ────────────────────

function createCell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20 })],
      }),
    ],
    width: { size: 0, type: WidthType.AUTO },
  });
}

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  // Service-role client for reads (see listing route): avoids dependency on the
  // JWT `prison_id` claim while still scoping the query to `prisonId`.
  const { db: supabase, prisonId } = auth;
  const { id } = await params;

  // Fetch registration with inmate and visitors
  const { data: registration, error } = await supabase
    .from('visit_registrations')
    .select(
      `
      id,
      visit_date,
      time_slot_start,
      time_slot_end,
      status,
      notes,
      created_at,
      inmate:inmates!inner(prison_number, full_name, date_of_birth, classification),
      visitors:registration_visitors(full_name, date_of_birth, citizen_id, relationship, display_order)
      `,
    )
    .eq('id', id)
    .eq('prison_id', prisonId)
    .maybeSingle();

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  if (!registration) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy đăng ký.');
  }

  const inmateData = Array.isArray(registration.inmate)
    ? registration.inmate[0]
    : registration.inmate;

  if (!inmateData) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy thông tin người bị quản lý giam giữ.');
  }

  const inmate = inmateData as unknown as {
    prison_number: string;
    full_name: string;
    date_of_birth: string | null;
    classification: string;
  };
  const visitors = (
    registration.visitors as {
      full_name: string;
      date_of_birth: string | null;
      citizen_id: string;
      relationship: string;
      display_order: number;
    }[]
  ).sort((a, b) => a.display_order - b.display_order);

  // Build visitor table
  const headerBorder = {
    top: { style: BorderStyle.SINGLE, size: 1 },
    bottom: { style: BorderStyle.SINGLE, size: 1 },
    left: { style: BorderStyle.SINGLE, size: 1 },
    right: { style: BorderStyle.SINGLE, size: 1 },
  } as const;

  const visitorTableRows = [
    new TableRow({
      children: [
        createCell('STT', true),
        createCell('Họ và tên', true),
        createCell('Ngày sinh', true),
        createCell('Số CCCD', true),
        createCell('Quan hệ', true),
      ],
      tableHeader: true,
    }),
    ...visitors.map(
      (v, idx) =>
        new TableRow({
          children: [
            createCell((idx + 1).toString()),
            createCell(toTitleCaseName(v.full_name)),
            createCell(formatDateVN(v.date_of_birth)),
            createCell(v.citizen_id),
            createCell(v.relationship),
          ],
        }),
    ),
  ];

  const visitorTable = new Table({
    rows: visitorTableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: headerBorder,
  });

  // Build sections — starting with the administrative header
  const sections = [
    // ── Vietnamese administrative header (công văn) ──
    buildAdministrativeHeader(),

    // Spacer between header and content
    new Paragraph({ spacing: { after: 300 } }),

    // Title
    new Paragraph({
      text: 'PHIẾU ĐĂNG KÝ THĂM GẶP',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: `Mã lịch hẹn: ${id.substring(0, 8).toUpperCase()}`,
          bold: true,
          size: 24,
        }),
      ],
    }),

    // Date created
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Ngày tạo: ${formatDateTimeVN(registration.created_at)}`,
          size: 18,
          color: '666666',
        }),
      ],
    }),

    // Inmate section header
    new Paragraph({
      text: 'THÔNG TIN NGƯỜI BỊ QUẢN LÝ GIAM GIỮ',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Số giam: ', bold: true, size: 22 }),
        new TextRun({ text: inmate.prison_number, size: 22 }),
        new TextRun({ text: '    Phân loại: ', bold: true, size: 22 }),
        new TextRun({ text: inmate.classification, size: 22 }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Họ và tên: ', bold: true, size: 22 }),
        new TextRun({ text: toTitleCaseName(inmate.full_name), size: 22 }),
        new TextRun({ text: '    Ngày sinh: ', bold: true, size: 22 }),
        new TextRun({ text: formatDateVN(inmate.date_of_birth), size: 22 }),
      ],
      spacing: { after: 200 },
    }),

    // Visit details
    new Paragraph({
      text: 'THÔNG TIN LỊCH THĂM',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Ngày thăm: ', bold: true, size: 22 }),
        new TextRun({ text: formatDateVN(registration.visit_date), size: 22 }),
        new TextRun({ text: '    Thời gian: ', bold: true, size: 22 }),
        new TextRun({
          text: `${registration.time_slot_start} - ${registration.time_slot_end}`,
          size: 22,
        }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Trạng thái: ', bold: true, size: 22 }),
        new TextRun({
          text: STATUS_LABELS[registration.status] || registration.status,
          size: 22,
        }),
      ],
      spacing: { after: 200 },
    }),

    // Visitors table
    new Paragraph({
      text: 'DANH SÁCH NGƯỜI THĂM',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }),
    visitorTable,
  ];

  // Add notes if present
  if (registration.notes) {
    sections.push(
      new Paragraph({
        text: 'GHI CHÚ',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      }),
      new Paragraph({
        text: registration.notes,
        spacing: { after: 100 },
      }),
    );
  }

  // Generate DOCX
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: DEFAULT_FONT },
        },
      },
    },
    sections: [
      {
        children: sections,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="phieu-tham-gap-${id}.docx"`,
    },
  });
}
