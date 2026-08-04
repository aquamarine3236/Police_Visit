'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Search,
  Plus,
  Download,
  Upload,
  Edit,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Users2,
  Loader2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useFileDownload } from '@/hooks/use-file-download';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FileUpload } from '@/components/shared/file-upload';
import {
  relativeFormSchema,
  type RelativeFormData,
  MAX_RELATIVES_PER_INMATE,
} from '@/lib/validations/inmate-relative';
import {
  lookupInmate,
  listRelativesByInmate,
  createRelative,
  updateRelative,
  deleteRelative,
} from '@/actions/inmate-relatives';
import type { InmateLookupResult } from '@/lib/services/inmate-relatives';
import { formatDateVN, toTitleCaseName } from '@/lib/format';
import type { InmateRelative } from '@/types';

const EMPTY_RELATIVE: RelativeFormData = {
  full_name: '',
  date_of_birth: '',
  citizen_id: '',
  relationship: '',
};

export default function RelativesPage() {
  const { toast } = useToast();
  const { download: downloadExport, downloading: exporting } = useFileDownload();

  // Lookup state
  const [prisonNumberInput, setPrisonNumberInput] = React.useState('');
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [inmate, setInmate] = React.useState<InmateLookupResult | null>(null);

  // Relatives list state
  const [relatives, setRelatives] = React.useState<InmateRelative[]>([]);
  const [listLoading, setListLoading] = React.useState(false);

  // Dialog state
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<InmateRelative | null>(null);

  // Import state
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importLoading, setImportLoading] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{
    imported: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const atLimit = relatives.length >= MAX_RELATIVES_PER_INMATE;

  // ─── Load relatives for the current inmate ───────────────────────────────
  const loadRelatives = React.useCallback(
    async (inmateId: string) => {
      setListLoading(true);
      try {
        const res = await listRelativesByInmate(inmateId);
        if (res.success) {
          setRelatives(res.data);
        } else {
          toast({
            title: 'Lỗi',
            description: res.message || 'Không thể tải danh sách thân thích.',
            variant: 'destructive',
          });
        }
      } finally {
        setListLoading(false);
      }
    },
    [toast],
  );

  // ─── Tra cứu theo Số giam ────────────────────────────────────────────────
  const handleLookup = async () => {
    const value = prisonNumberInput.trim();
    if (!value) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng nhập số giam.', variant: 'destructive' });
      return;
    }
    setLookupLoading(true);
    setInmate(null);
    setRelatives([]);
    try {
      const res = await lookupInmate(value);
      if (res.success) {
        setInmate(res.data);
        await loadRelatives(res.data.id);
      } else {
        toast({
          title: 'Không tìm thấy',
          description: res.message || 'Không tìm thấy người bị giam giữ.',
          variant: 'destructive',
        });
      }
    } finally {
      setLookupLoading(false);
    }
  };

  // Xóa tra cứu: bỏ bộ lọc hiện tại, quay về trạng thái ban đầu (xuất toàn bộ).
  const handleClearLookup = () => {
    setPrisonNumberInput('');
    setInmate(null);
    setRelatives([]);
  };

  // ─── Add form ─────────────────────────────────────────────────────────────
  const {
    register: registerAdd,
    handleSubmit: handleSubmitAdd,
    formState: { errors: errorsAdd, isSubmitting: isSubmittingAdd },
    reset: resetAdd,
    control: controlAdd,
  } = useForm<RelativeFormData>({
    resolver: zodResolver(relativeFormSchema),
    defaultValues: EMPTY_RELATIVE,
  });

  // ─── Edit form ─────────────────────────────────────────────────────────────
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit, isSubmitting: isSubmittingEdit },
    reset: resetEdit,
    control: controlEdit,
  } = useForm<RelativeFormData>({
    resolver: zodResolver(relativeFormSchema),
  });

  const onAddSubmit = async (data: RelativeFormData) => {
    if (!inmate) return;
    const res = await createRelative(inmate.id, data);
    if (res.success) {
      toast({ title: 'Thành công', description: 'Đã thêm thân thích mới.' });
      setIsAddOpen(false);
      resetAdd(EMPTY_RELATIVE);
      await loadRelatives(inmate.id);
    } else {
      toast({
        title: 'Thất bại',
        description: res.message || 'Không thể thêm thân thích.',
        variant: 'destructive',
      });
    }
  };

  // Surfaces react-hook-form validation failures (otherwise handleSubmit
  // swallows them silently → the Edit button appears to "do nothing").
  const onEditInvalid = (formErrors: Record<string, { message?: string }>) => {
    const first = Object.values(formErrors)[0];
    toast({
      title: 'Dữ liệu không hợp lệ',
      description: first?.message || 'Vui lòng kiểm tra lại các trường.',
      variant: 'destructive',
    });
  };

  const onEditSubmit = async (data: RelativeFormData) => {
    if (!selected || !inmate) {
      toast({
        title: 'Thiếu thông tin',
        description: 'Chưa chọn thân thích hoặc người bị giam.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const res = await updateRelative(selected.id, data);
      if (res.success) {
        toast({ title: 'Thành công', description: 'Đã cập nhật thân thích.' });
        setIsEditOpen(false);
        await loadRelatives(inmate.id);
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể cập nhật thân thích.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Không thể cập nhật thân thích.';
      console.error('[relatives] updateRelative failed:', err);
      toast({ title: 'Lỗi', description: message, variant: 'destructive' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selected || !inmate) return;
    try {
      const res = await deleteRelative(selected.id);
      if (res.success) {
        toast({ title: 'Thành công', description: 'Đã xóa thân thích.' });
        setIsDeleteOpen(false);
        await loadRelatives(inmate.id);
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể xóa thân thích.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Không thể xóa thân thích.';
      console.error('[relatives] deleteRelative failed:', err);
      toast({ title: 'Lỗi', description: message, variant: 'destructive' });
    }
  };

  const openEdit = (relative: InmateRelative) => {
    setSelected(relative);
    resetEdit({
      full_name: relative.full_name,
      date_of_birth: relative.date_of_birth || '',
      citizen_id: relative.citizen_id,
      relationship: relative.relationship,
    });
    setIsEditOpen(true);
  };

  const openDelete = (relative: InmateRelative) => {
    setSelected(relative);
    setIsDeleteOpen(true);
  };

  // ─── Import Excel ─────────────────────────────────────────────────────────
  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch('/api/v1/admin/relatives/import', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Lỗi khi nhập dữ liệu.');
      }

      setImportResult({
        imported: json.imported,
        skipped: json.skipped,
        errors: json.errors || [],
      });
      toast({
        title: 'Hoàn thành nhập dữ liệu',
        description: `Đã nhập ${json.imported} thân thích (bỏ qua ${json.skipped} bản trùng).`,
      });

      // Nếu đang xem một người bị giam, tải lại danh sách.
      if (inmate) await loadRelatives(inmate.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể xử lý tệp.';
      toast({ title: 'Lỗi nhập dữ liệu', description: message, variant: 'destructive' });
    } finally {
      setImportLoading(false);
    }
  };

  // ─── Export Excel ─────────────────────────────────────────────────────────
  // Phạm vi xuất được xác định TƯỜNG MINH để tránh trạng thái "lệch pha" giữa
  // ô nhập số giam và kết quả tra cứu (inmate):
  //   1. Đã tra cứu & ô nhập trống hoặc khớp số giam  → xuất riêng người đó.
  //   2. Ô nhập có chữ nhưng CHƯA tra cứu / không khớp → chặn, yêu cầu tra cứu
  //      (không âm thầm xuất toàn bộ hoặc xuất theo bộ lọc cũ).
  //   3. Ô nhập trống & chưa tra cứu                   → xuất toàn bộ (chủ đích).
  const typedPrisonNumber = prisonNumberInput.trim();
  const exportScope: 'inmate' | 'all' | 'blocked' =
    inmate && (typedPrisonNumber === '' || typedPrisonNumber === inmate.prison_number)
      ? 'inmate'
      : typedPrisonNumber !== ''
        ? 'blocked'
        : 'all';

  const handleExport = async () => {
    if (exportScope === 'blocked') {
      toast({
        title: 'Chưa áp dụng bộ lọc',
        description:
          'Vui lòng bấm "Tra cứu" để áp dụng số giam trước khi xuất, hoặc xóa trống ô nhập để xuất toàn bộ.',
        variant: 'destructive',
      });
      return;
    }

    const url =
      exportScope === 'inmate' && inmate
        ? `/api/v1/admin/relatives/export?prison_number=${encodeURIComponent(inmate.prison_number)}`
        : '/api/v1/admin/relatives/export';
    const ok = await downloadExport(url, 'danh-sach-than-thich.xlsx');
    if (!ok) {
      toast({
        title: 'Lỗi',
        description: 'Không thể xuất danh sách. Vui lòng thử lại.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-heading-xl font-bold tracking-tight text-ink">
            Thân nhân người bị giam giữ
          </h1>
          <p className="text-caption-md text-mute">
            Quản lý danh sách người thân thích được phép đăng ký thăm gặp
            (tối đa {MAX_RELATIVES_PER_INMATE} người mỗi người bị giam).
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" onClick={() => { setImportResult(null); setImportFile(null); setIsImportOpen(true); }}>
            <Upload className="mr-2 h-4 w-4" />
            Nhập Excel
          </Button>
          <Button
            variant="outline"
            disabled={exporting}
            onClick={handleExport}
            title={
              exportScope === 'inmate' && inmate
                ? `Xuất thân thích của số giam ${inmate.prison_number}`
                : exportScope === 'blocked'
                  ? 'Bấm "Tra cứu" để áp dụng số giam trước khi xuất'
                  : 'Xuất toàn bộ danh sách thân thích'
            }
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting
              ? 'Đang xuất...'
              : exportScope === 'inmate' && inmate
                ? `Xuất Excel (${inmate.prison_number})`
                : 'Xuất Excel'}
          </Button>
        </div>
      </div>

      {/* Tra cứu theo Số giam */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <Label htmlFor="prison_number_lookup">Số giam</Label>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <Input
              id="prison_number_lookup"
              placeholder="Nhập số giam để tra cứu..."
              value={prisonNumberInput}
              onChange={(e) => setPrisonNumberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLookup();
                }
              }}
              className="h-11 pl-9"
            />
          </div>
        </div>
        {exportScope === 'inmate' && inmate ? (
          <Button className="h-11" variant="outline" onClick={handleClearLookup}>
            <X className="mr-2 h-4 w-4" />
            Xóa tra cứu
          </Button>
        ) : (
          <Button className="h-11" onClick={handleLookup} disabled={lookupLoading}>
            {lookupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Tra cứu
          </Button>
        )}
      </div>

      {/* Thông tin người bị giam (chỉ đọc) */}
      {inmate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-body-lg">Thông tin người bị giam giữ</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-caption-sm text-mute">Số giam</dt>
                <dd className="text-body-md font-medium text-ink">{inmate.prison_number}</dd>
              </div>
              <div>
                <dt className="text-caption-sm text-mute">Họ và tên</dt>
                <dd className="text-body-md font-medium text-ink">{toTitleCaseName(inmate.full_name)}</dd>
              </div>
              <div>
                <dt className="text-caption-sm text-mute">Ngày sinh</dt>
                <dd className="text-body-md text-ink">{formatDateVN(inmate.date_of_birth) || '—'}</dd>
              </div>
              <div>
                <dt className="text-caption-sm text-mute">CCCD</dt>
                <dd className="text-body-md text-ink">{inmate.citizen_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-caption-sm text-mute">Địa chỉ thường trú</dt>
                <dd className="text-body-md text-ink">{inmate.permanent_address || '—'}</dd>
              </div>
              <div>
                <dt className="text-caption-sm text-mute">Tội giam</dt>
                <dd className="text-body-md text-ink">{inmate.criminal_offense || '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Danh sách thân thích */}
      {inmate && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-heading-md font-semibold text-ink">Danh sách thân thích</h2>
              <p className="text-caption-sm text-mute">
                {relatives.length}/{MAX_RELATIVES_PER_INMATE} người
              </p>
            </div>
            <Button
              onClick={() => { resetAdd(EMPTY_RELATIVE); setIsAddOpen(true); }}
              disabled={atLimit}
              title={atLimit ? `Đã đạt tối đa ${MAX_RELATIVES_PER_INMATE} thân thích.` : undefined}
            >
              <Plus className="mr-2 h-4 w-4" />
              Thêm thân thích
            </Button>
          </div>

          {atLimit && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-caption-md text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Đã đạt tối đa {MAX_RELATIVES_PER_INMATE} thân thích. Xóa bớt để thêm người mới.
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ và tên</TableHead>
                  <TableHead>Ngày sinh</TableHead>
                  <TableHead>CCCD</TableHead>
                  <TableHead>Mối quan hệ</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-mute">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : relatives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-0">
                      <EmptyState
                        icon={Users2}
                        title="Chưa có thân thích"
                        description="Người bị giam này chưa có thân thích nào. Thêm thủ công hoặc nhập từ Excel."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  relatives.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-ink">{toTitleCaseName(r.full_name)}</TableCell>
                      <TableCell>{formatDateVN(r.date_of_birth) || '—'}</TableCell>
                      <TableCell>{r.citizen_id}</TableCell>
                      <TableCell>{r.relationship}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openDelete(r)}>
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!inmate && !lookupLoading && (
        <EmptyState
          icon={Search}
          title="Tra cứu theo số giam"
          description="Nhập số giam ở trên để xem thông tin người bị giam và quản lý danh sách thân thích."
        />
      )}

      {/* ─── Add Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <form onSubmit={handleSubmitAdd(onAddSubmit)}>
            <DialogHeader>
              <DialogTitle>Thêm thân thích</DialogTitle>
              <DialogDescription>
                Thêm một người thân thích được phép đăng ký thăm gặp cho{' '}
                {inmate ? toTitleCaseName(inmate.full_name) : 'người bị giam'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <RelativeFormFields register={registerAdd} errors={errorsAdd} control={controlAdd} prefix="add" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSubmittingAdd}>
                {isSubmittingAdd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <form onSubmit={handleSubmitEdit(onEditSubmit, onEditInvalid)}>
            <DialogHeader>
              <DialogTitle>Chỉnh sửa thân thích</DialogTitle>
              <DialogDescription>Cập nhật thông tin người thân thích.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <RelativeFormFields register={registerEdit} errors={errorsEdit} control={controlEdit} prefix="edit" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cập nhật
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Xóa thân thích"
        description={`Bạn có chắc chắn muốn xóa "${selected ? toTitleCaseName(selected.full_name) : ''}" khỏi danh sách thân thích?`}
        confirmLabel="Xóa"
        destructive
        onConfirm={handleDeleteConfirm}
      />

      {/* ─── Import Dialog ──────────────────────────────────────────────── */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nhập thân thích từ Excel</DialogTitle>
            <DialogDescription>
              Tệp cần các cột: Số giam, Họ và tên, Ngày sinh (không bắt buộc), CCCD, Mối quan hệ.
              Dữ liệu được gom theo số giam. Không nhập trùng và không vượt quá {MAX_RELATIVES_PER_INMATE} người.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <FileUpload
              onFileSelect={setImportFile}
              onFileClear={() => setImportFile(null)}
              loading={importLoading}
            />

            {importResult && (
              <div className="space-y-2 rounded-md border border-hairline bg-soft-cloud p-3 text-caption-md">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Đã nhập {importResult.imported} thân thích, bỏ qua {importResult.skipped} bản trùng.
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto text-danger">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{e.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>
              Đóng
            </Button>
            <Button onClick={handleImportSubmit} disabled={!importFile || importLoading}>
              {importLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Nhập dữ liệu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared form fields for Add/Edit dialogs ────────────────────────────────

interface RelativeFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  prefix: string;
}

function RelativeFormFields({ register, errors, control, prefix }: RelativeFormFieldsProps) {
  return (
    <>
      <div>
        <Label htmlFor={`${prefix}_full_name`}>Họ và tên *</Label>
        <Input id={`${prefix}_full_name`} className="mt-1.5" {...register('full_name')} />
        {errors.full_name && <p className="mt-1 text-caption-sm text-danger">{errors.full_name.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${prefix}_date_of_birth`}>Ngày sinh</Label>
          <Controller
            control={control}
            name="date_of_birth"
            render={({ field }) => (
              <DateInput
                id={`${prefix}_date_of_birth`}
                className="mt-1.5"
                value={field.value || ''}
                onChange={field.onChange}
              />
            )}
          />
          {errors.date_of_birth && <p className="mt-1 text-caption-sm text-danger">{errors.date_of_birth.message}</p>}
        </div>
        <div>
          <Label htmlFor={`${prefix}_citizen_id`}>CCCD *</Label>
          <Input
            id={`${prefix}_citizen_id`}
            className="mt-1.5"
            inputMode="numeric"
            maxLength={12}
            {...register('citizen_id')}
          />
          {errors.citizen_id && <p className="mt-1 text-caption-sm text-danger">{errors.citizen_id.message}</p>}
        </div>
      </div>

      <div>
        <Label htmlFor={`${prefix}_relationship`}>Mối quan hệ *</Label>
        <Input id={`${prefix}_relationship`} className="mt-1.5" placeholder="Vợ, chồng, con, ..." {...register('relationship')} />
        {errors.relationship && <p className="mt-1 text-caption-sm text-danger">{errors.relationship.message}</p>}
      </div>
    </>
  );
}
