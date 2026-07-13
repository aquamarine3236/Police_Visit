import { NextRequest, NextResponse } from 'next/server';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import { formatDateVN, formatDateTimeVN, toTitleCaseName } from '@/lib/format';

// ─── Status labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  no_show: 'Không đến',
};

// ─── Font setup (use Roboto bundled with pdfmake) ───────────────────────────

const fonts: TFontDictionary = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts.js',
    bold: 'node_modules/pdfmake/build/vfs_fonts.js',
    italics: 'node_modules/pdfmake/build/vfs_fonts.js',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
  },
};

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  const { supabase, prisonId } = auth;
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
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy thông tin phạm nhân.');
  }

  const inmate = inmateData as unknown as {
    prison_number: string;
    full_name: string;
    date_of_birth: string;
    classification: string;
  };
  const visitors = (
    registration.visitors as {
      full_name: string;
      date_of_birth: string;
      citizen_id: string;
      relationship: string;
      display_order: number;
    }[]
  ).sort((a, b) => a.display_order - b.display_order);

  // Build visitor table rows
  const visitorTableBody = [
    [
      { text: 'STT', style: 'tableHeader' },
      { text: 'Họ và tên', style: 'tableHeader' },
      { text: 'Ngày sinh', style: 'tableHeader' },
      { text: 'Số CCCD', style: 'tableHeader' },
      { text: 'Quan hệ', style: 'tableHeader' },
    ],
    ...visitors.map((v, idx) => [
      (idx + 1).toString(),
      toTitleCaseName(v.full_name),
      formatDateVN(v.date_of_birth),
      v.citizen_id,
      v.relationship,
    ]),
  ];

  // Build PDF document definition
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      {
        text: 'PHIẾU ĐĂNG KÝ THĂM GẶP',
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20],
      },
      {
        text: `Ngày tạo: ${formatDateTimeVN(registration.created_at)}`,
        alignment: 'right',
        fontSize: 9,
        color: '#666666',
        margin: [0, 0, 0, 15],
      },
      {
        text: 'THÔNG TIN PHẠM NHÂN',
        style: 'sectionHeader',
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          { text: `Số hiệu: ${inmate.prison_number}`, width: '50%' },
          { text: `Phân loại: ${inmate.classification}`, width: '50%' },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        columns: [
          { text: `Họ và tên: ${toTitleCaseName(inmate.full_name)}`, width: '50%' },
          { text: `Ngày sinh: ${formatDateVN(inmate.date_of_birth)}`, width: '50%' },
        ],
        margin: [0, 0, 0, 15],
      },
      {
        text: 'THÔNG TIN LỊCH THĂM',
        style: 'sectionHeader',
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          { text: `Ngày thăm: ${formatDateVN(registration.visit_date)}`, width: '50%' },
          {
            text: `Thời gian: ${registration.time_slot_start} - ${registration.time_slot_end}`,
            width: '50%',
          },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        text: `Trạng thái: ${STATUS_LABELS[registration.status] || registration.status}`,
        margin: [0, 0, 0, 15],
      },
      {
        text: 'DANH SÁCH NGƯỜI THĂM',
        style: 'sectionHeader',
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths: [30, '*', 80, 100, '*'],
          body: visitorTableBody,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20],
      },
      ...(registration.notes
        ? [
            {
              text: 'GHI CHÚ',
              style: 'sectionHeader' as const,
              margin: [0, 0, 0, 8] as [number, number, number, number],
            },
            { text: registration.notes, margin: [0, 0, 0, 0] as [number, number, number, number] },
          ]
        : []),
    ],
    styles: {
      header: {
        fontSize: 18,
        bold: true,
      },
      sectionHeader: {
        fontSize: 12,
        bold: true,
        color: '#333333',
      },
      tableHeader: {
        bold: true,
        fontSize: 10,
        color: '#333333',
      },
    },
    defaultStyle: {
      fontSize: 10,
    },
  };

  // Generate PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PdfPrinterClass = PdfPrinter as any;
  const printer = new PdfPrinterClass(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  // Collect buffer
  const chunks: Uint8Array[] = [];
  return new Promise<NextResponse>((resolve) => {
    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve(
        new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="phieu-tham-gap-${id}.pdf"`,
          },
        }),
      );
    });
    pdfDoc.end();
  });
}
