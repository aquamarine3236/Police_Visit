import ExcelJS from 'exceljs';

import type { Inmate } from '@/types';

// ─── Vietnamese header style ────────────────────────────────────────────────

function styleHeaderRow(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 12 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  worksheet.columns.forEach((col) => {
    col.width = Math.max(col.width ?? 12, 15);
  });
}

// ─── Export Inmates to Excel ────────────────────────────────────────────────

export async function exportInmatesToExcel(
  inmates: Inmate[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Hệ thống Quản lý Đăng ký Thăm gặp';

  const worksheet = workbook.addWorksheet('Danh sách phạm nhân');

  worksheet.columns = [
    { header: 'STT', key: 'stt', width: 8 },
    { header: 'Số hiệu', key: 'prison_number', width: 15 },
    { header: 'Họ và tên', key: 'full_name', width: 25 },
    { header: 'Ngày sinh', key: 'date_of_birth', width: 15 },
    { header: 'Số CCCD', key: 'citizen_id', width: 18 },
    { header: 'Địa chỉ thường trú', key: 'permanent_address', width: 35 },
    { header: 'Tội danh', key: 'criminal_offense', width: 30 },
    { header: 'Ngày bắt', key: 'arrest_date', width: 15 },
    { header: 'Ngày nhập trại', key: 'admission_date', width: 15 },
    { header: 'Phân loại', key: 'classification', width: 22 },
    { header: 'Trạng thái thăm gặp', key: 'visit_status', width: 22 },
  ];

  styleHeaderRow(worksheet);

  inmates.forEach((inmate, idx) => {
    worksheet.addRow({
      stt: idx + 1,
      prison_number: inmate.prison_number,
      full_name: inmate.full_name,
      date_of_birth: inmate.date_of_birth,
      citizen_id: inmate.citizen_id || '',
      permanent_address: inmate.permanent_address || '',
      criminal_offense: inmate.criminal_offense || '',
      arrest_date: inmate.arrest_date || '',
      admission_date: inmate.admission_date || '',
      classification: inmate.classification,
      visit_status: inmate.visit_status,
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Registration row type for export ───────────────────────────────────────

interface RegistrationExportRow {
  id: string;
  visit_date: string;
  time_slot_start: string;
  time_slot_end: string;
  status: string;
  created_at: string;
  inmate?: {
    prison_number: string;
    full_name: string;
  };
  visitors?: {
    full_name: string;
    citizen_id: string;
    relationship: string;
  }[];
}

// ─── Status labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  no_show: 'Không đến',
};

// ─── Export Registrations to Excel ──────────────────────────────────────────

export async function exportRegistrationsToExcel(
  registrations: RegistrationExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Hệ thống Quản lý Đăng ký Thăm gặp';

  const worksheet = workbook.addWorksheet('Danh sách đăng ký thăm gặp');

  worksheet.columns = [
    { header: 'STT', key: 'stt', width: 8 },
    { header: 'Ngày thăm', key: 'visit_date', width: 15 },
    { header: 'Thời gian', key: 'time_slot', width: 18 },
    { header: 'Số hiệu phạm nhân', key: 'prison_number', width: 20 },
    { header: 'Tên phạm nhân', key: 'inmate_name', width: 25 },
    { header: 'Người thăm', key: 'visitor_names', width: 35 },
    { header: 'CCCD người thăm', key: 'visitor_cccd', width: 25 },
    { header: 'Quan hệ', key: 'relationship', width: 20 },
    { header: 'Trạng thái', key: 'status', width: 18 },
    { header: 'Ngày tạo', key: 'created_at', width: 20 },
  ];

  styleHeaderRow(worksheet);

  registrations.forEach((reg, idx) => {
    const visitors = reg.visitors ?? [];
    worksheet.addRow({
      stt: idx + 1,
      visit_date: reg.visit_date,
      time_slot: `${reg.time_slot_start} - ${reg.time_slot_end}`,
      prison_number: reg.inmate?.prison_number || '',
      inmate_name: reg.inmate?.full_name || '',
      visitor_names: visitors.map((v) => v.full_name).join(', '),
      visitor_cccd: visitors.map((v) => v.citizen_id).join(', '),
      relationship: visitors.map((v) => v.relationship).join(', '),
      status: STATUS_LABELS[reg.status] || reg.status,
      created_at: reg.created_at ? new Date(reg.created_at).toLocaleString('vi-VN') : '',
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
