import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import { inmateFormSchema } from '@/lib/validations/inmate';

// ─── Column mapping: expected Excel header → DB field ───────────────────────

const COLUMN_MAP: Record<string, string> = {
  'Số hiệu': 'prison_number',
  'Họ và tên': 'full_name',
  'Ngày sinh': 'date_of_birth',
  'Số CCCD': 'citizen_id',
  'Địa chỉ thường trú': 'permanent_address',
  'Tội danh': 'criminal_offense',
  'Ngày bắt': 'arrest_date',
  'Ngày nhập trại': 'admission_date',
  'Phân loại': 'classification',
  'Trạng thái thăm gặp': 'visit_status',
};

const REQUIRED_COLUMNS = ['Số hiệu', 'Họ và tên', 'Ngày sinh', 'Phân loại', 'Trạng thái thăm gặp'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 5000;
const BATCH_SIZE = 100;

// ─── Helpers ────────────────────────────────────────────────────────────────

function cellToString(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    // ExcelJS parse ô ngày về nửa đêm UTC. Đọc trực tiếp thành phần UTC để
    // lấy đúng ngày trong file, không phụ thuộc timezone của server (Vercel=UTC).
    const yyyy = cell.getUTCFullYear();
    const mm = String(cell.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cell.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof cell === 'object' && 'text' in cell) {
    return String((cell as { text: string }).text).trim();
  }
  return String(cell).trim();
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  // `db` bypasses RLS (service role) for trusted admin writes; the admin has
  // already been authorised by requireAdminAuth above.
  const { db, prisonId, userId } = auth;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, 'INVALID_INPUT', 'Không thể đọc dữ liệu tải lên.');
  }

  const file = formData.get('file');
  const importMode = (formData.get('import_mode') as string) || 'append';

  if (!file || !(file instanceof File)) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng chọn tệp để tải lên.');
  }

  // Validate file type
  if (
    !file.name.endsWith('.xlsx') &&
    file.type !==
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return errorResponse(400, 'INVALID_INPUT', 'Chỉ chấp nhận tệp định dạng .xlsx.');
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(400, 'INVALID_INPUT', 'Kích thước tệp không được vượt quá 5MB.');
  }

  // Validate import_mode
  if (!['append', 'replace'].includes(importMode)) {
    return errorResponse(400, 'INVALID_INPUT', 'Chế độ nhập phải là "append" hoặc "replace".');
  }

  // Read file into buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate file signature (magic bytes). A real .xlsx is a ZIP container,
  // which always begins with "PK\x03\x04" (0x50 0x4B 0x03 0x04). This defends
  // against files that merely carry a .xlsx extension or spoofed MIME type.
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return errorResponse(
      400,
      'INVALID_INPUT',
      'Tệp không phải định dạng Excel (.xlsx) hợp lệ.',
    );
  }

  // Parse Excel
  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    return errorResponse(400, 'INVALID_INPUT', 'Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    return errorResponse(400, 'INVALID_INPUT', 'Tệp không có dữ liệu.');
  }

  // Read header row
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value).trim();
  });

  // Validate required columns
  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    return errorResponse(
      400,
      'INVALID_INPUT',
      `Tệp thiếu các cột bắt buộc: ${missingColumns.join(', ')}.`,
    );
  }

  // Map header index → field name
  const colFieldMap: Record<number, string> = {};
  headers.forEach((header, idx) => {
    if (COLUMN_MAP[header]) {
      colFieldMap[idx] = COLUMN_MAP[header];
    }
  });

  // Parse data rows
  const dataRowCount = worksheet.rowCount - 1;
  if (dataRowCount > MAX_ROWS) {
    return errorResponse(400, 'INVALID_INPUT', 'Tệp không được vượt quá 5000 dòng dữ liệu.');
  }

  interface RowError {
    row: number;
    message: string;
  }

  const validRecords: Record<string, unknown>[] = [];
  const errors: RowError[] = [];
  let skipped = 0;

  // If append mode, preload existing prison_numbers for dedup
  const existingNumbers = new Set<string>();
  if (importMode === 'append') {
    const { data: existing } = await db
      .from('inmates')
      .select('prison_number')
      .eq('prison_id', prisonId)
      .is('deleted_at', null);
    if (existing) {
      for (const row of existing) {
        existingNumbers.add(row.prison_number);
      }
    }
  }

  // Iterate data rows (starting at row 2)
  for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
    const row = worksheet.getRow(rowIdx);
    const rowData: Record<string, string> = {};

    // Check if entirely empty
    let isEmpty = true;
    for (const [colIdx, fieldName] of Object.entries(colFieldMap)) {
      const value = cellToString(row.getCell(parseInt(colIdx, 10)).value);
      if (value) isEmpty = false;
      rowData[fieldName] = value;
    }
    if (isEmpty) continue;

    // Validate row against Zod schema
    const parsed = inmateFormSchema.safeParse({
      ...rowData,
      citizen_id: rowData.citizen_id || undefined,
      permanent_address: rowData.permanent_address || undefined,
      criminal_offense: rowData.criminal_offense || undefined,
      arrest_date: rowData.arrest_date || undefined,
      admission_date: rowData.admission_date || undefined,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.';
      errors.push({ row: rowIdx, message: `Dòng ${rowIdx}: ${firstError}` });
      continue;
    }

    // Append mode: skip if prison_number already exists
    if (importMode === 'append' && existingNumbers.has(parsed.data.prison_number)) {
      skipped++;
      continue;
    }

    validRecords.push({
      ...parsed.data,
      prison_id: prisonId,
      citizen_id: parsed.data.citizen_id || null,
      permanent_address: parsed.data.permanent_address || null,
      criminal_offense: parsed.data.criminal_offense || null,
      arrest_date: parsed.data.arrest_date || null,
      admission_date: parsed.data.admission_date || null,
      created_by: userId,
      updated_by: userId,
    });
  }

  // Replace mode: soft-delete all existing active inmates first
  if (importMode === 'replace') {
    const { error: deleteError } = await db
      .from('inmates')
      .update({ deleted_at: new Date().toISOString(), updated_by: userId })
      .eq('prison_id', prisonId)
      .is('deleted_at', null);

    if (deleteError) {
      return errorResponse(500, 'SERVER_ERROR', `Lỗi khi xóa dữ liệu cũ: ${deleteError.message}`);
    }
  }

  // Insert valid records in batches
  let imported = 0;
  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const batch = validRecords.slice(i, i + BATCH_SIZE);
    const { error: insertError, data: insertedData } = await db
      .from('inmates')
      .insert(batch)
      .select('id');

    if (insertError) {
      errors.push({
        row: i + 2,
        message: `Lỗi khi nhập lô ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`,
      });
    } else {
      imported += insertedData?.length ?? batch.length;
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    errors,
    import_mode: importMode,
  });
}
