import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import {
  relativeImportRowSchema,
  MAX_RELATIVES_PER_INMATE,
} from '@/lib/validations/inmate-relative';

// ─── Column mapping: expected Excel header → field ──────────────────────────
// KHỚP với định dạng export (exportRelativesToExcel).

const COLUMN_MAP: Record<string, string> = {
  'Số giam': 'prison_number',
  'Họ và tên': 'full_name',
  'Ngày sinh': 'date_of_birth',
  'Mối quan hệ': 'relationship',
};

const REQUIRED_COLUMNS = ['Số giam', 'Họ và tên', 'Mối quan hệ'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 5000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function cellToString(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    // ExcelJS parse ô ngày về nửa đêm UTC. Đọc trực tiếp thành phần UTC để lấy
    // đúng ngày trong file, không phụ thuộc timezone của server (Vercel = UTC).
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

interface RowError {
  row: number;
  message: string;
}

interface RelativePayload {
  full_name: string;
  date_of_birth: string | null;
  relationship: string;
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  // `db` bypasses RLS (service role) — admin đã được xác thực ở trên.
  const { db, prisonId, userId } = auth;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, 'INVALID_INPUT', 'Không thể đọc dữ liệu tải lên.');
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return errorResponse(400, 'INVALID_INPUT', 'Vui lòng chọn tệp để tải lên.');
  }

  if (
    !file.name.endsWith('.xlsx') &&
    file.type !==
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return errorResponse(400, 'INVALID_INPUT', 'Chỉ chấp nhận tệp định dạng .xlsx.');
  }

  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(400, 'INVALID_INPUT', 'Kích thước tệp không được vượt quá 5MB.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate file signature (magic bytes: real .xlsx là ZIP "PK\x03\x04").
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

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    return errorResponse(
      400,
      'INVALID_INPUT',
      `Tệp thiếu các cột bắt buộc: ${missingColumns.join(', ')}.`,
    );
  }

  const colFieldMap: Record<number, string> = {};
  headers.forEach((header, idx) => {
    if (COLUMN_MAP[header]) {
      colFieldMap[idx] = COLUMN_MAP[header];
    }
  });

  const dataRowCount = worksheet.rowCount - 1;
  if (dataRowCount > MAX_ROWS) {
    return errorResponse(400, 'INVALID_INPUT', 'Tệp không được vượt quá 5000 dòng dữ liệu.');
  }

  const errors: RowError[] = [];
  // Gom theo Số giam: prison_number → danh sách thân thích hợp lệ.
  const groups = new Map<string, RelativePayload[]>();
  // Chống trùng thân thích ngay trong file (theo từng prison_number).
  const seenRelatives = new Map<string, Set<string>>();

  // ─── Parse & validate từng dòng dữ liệu ─────────────────────────────────
  for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
    const row = worksheet.getRow(rowIdx);
    const rowData: Record<string, string> = {};

    let isEmpty = true;
    for (const [colIdx, fieldName] of Object.entries(colFieldMap)) {
      const value = cellToString(row.getCell(parseInt(colIdx, 10)).value);
      if (value) isEmpty = false;
      rowData[fieldName] = value;
    }
    if (isEmpty) continue;

    const parsed = relativeImportRowSchema.safeParse({
      prison_number: rowData.prison_number,
      full_name: rowData.full_name,
      date_of_birth: rowData.date_of_birth || undefined,
      relationship: rowData.relationship,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.';
      errors.push({ row: rowIdx, message: `Dòng ${rowIdx}: ${firstError}` });
      continue;
    }

    const pn = parsed.data.prison_number.trim();

    const relativeKey = [
      parsed.data.full_name.trim().toLocaleLowerCase(),
      parsed.data.date_of_birth || '',
      parsed.data.relationship.trim().toLocaleLowerCase(),
    ].join('|');
    if (!seenRelatives.has(pn)) seenRelatives.set(pn, new Set());
    const seen = seenRelatives.get(pn)!;
    if (seen.has(relativeKey)) {
      continue;
    }
    seen.add(relativeKey);

    if (!groups.has(pn)) groups.set(pn, []);
    groups.get(pn)!.push({
      full_name: parsed.data.full_name.trim(),
      date_of_birth: parsed.data.date_of_birth || null,
      relationship: parsed.data.relationship.trim(),
    });
  }

  if (groups.size === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      errors: errors.length > 0 ? errors : [{ row: 0, message: 'Không có dòng hợp lệ để nhập.' }],
    });
  }

  // ─── Ánh xạ Số giam → inmate_id (một query, tránh N+1) ──────────────────
  const prisonNumbers = Array.from(groups.keys());
  const { data: inmates, error: inmateError } = await db
    .from('inmates')
    .select('id, prison_number')
    .eq('prison_id', prisonId)
    .is('deleted_at', null)
    .in('prison_number', prisonNumbers);

  if (inmateError) {
    return errorResponse(500, 'SERVER_ERROR', `Lỗi khi tra cứu người bị giam: ${inmateError.message}`);
  }

  const inmateIdByNumber = new Map<string, string>();
  for (const inmate of inmates ?? []) {
    inmateIdByNumber.set(inmate.prison_number, inmate.id);
  }

  // Báo lỗi rõ ràng cho các Số giam không tồn tại; chỉ giữ nhóm hợp lệ.
  const validGroups: { inmate_id: string; relatives: RelativePayload[] }[] = [];
  for (const [pn, relatives] of groups.entries()) {
    const inmateId = inmateIdByNumber.get(pn);
    if (!inmateId) {
      errors.push({ row: 0, message: `Số giam "${pn}" không tồn tại trong hệ thống.` });
      continue;
    }

    // Cảnh báo sớm nếu số lượng trong file đã vượt trần (RPC vẫn kiểm tra lại
    // cùng với dữ liệu hiện có, đây chỉ là thông báo thân thiện).
    if (relatives.length > MAX_RELATIVES_PER_INMATE) {
      errors.push({
        row: 0,
        message: `Số giam "${pn}" có ${relatives.length} thân thích trong tệp, vượt quá tối đa ${MAX_RELATIVES_PER_INMATE}.`,
      });
      continue;
    }

    validGroups.push({ inmate_id: inmateId, relatives });
  }

  if (validGroups.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0, errors });
  }

  // ─── Nhập hàng loạt trong 1 transaction (RPC) ───────────────────────────
  // Toàn bộ validGroups được ghi nguyên tử: nếu bất kỳ người bị giam nào vượt
  // trần 10 (tính cả dữ liệu hiện có) thì RPC rollback toàn bộ.
  const { data: rpcResult, error: rpcError } = await db.rpc('fn_bulk_import_relatives', {
    p_groups: validGroups,
    p_user_id: userId,
  });

  if (rpcError) {
    // Bóc tách lỗi vượt trần để trả thông báo rõ ràng.
    if (rpcError.message.includes('LIMIT_EXCEEDED')) {
      const match = rpcError.message.match(/LIMIT_EXCEEDED:([0-9a-f-]+)/i);
      const badId = match?.[1];
      // Suy ngược prison_number từ inmate_id để thông báo thân thiện.
      let label = '';
      for (const [pn, id] of inmateIdByNumber.entries()) {
        if (id === badId) {
          label = ` (số giam "${pn}")`;
          break;
        }
      }
      return errorResponse(
        400,
        'INVALID_INPUT',
        `Một người bị giam${label} sẽ vượt quá tối đa ${MAX_RELATIVES_PER_INMATE} thân thích. Không có dữ liệu nào được nhập.`,
      );
    }
    return errorResponse(500, 'SERVER_ERROR', `Lỗi khi nhập dữ liệu: ${rpcError.message}`);
  }

  const result = (rpcResult ?? {}) as { imported?: number; skipped?: number };

  return NextResponse.json({
    imported: result.imported ?? 0,
    skipped: result.skipped ?? 0,
    errors,
  });
}
