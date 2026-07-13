'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Edit, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FileUpload } from '@/components/shared/file-upload';
import { 
  inmateFormSchema, 
  type InmateFormData, 
  INMATE_CLASSIFICATIONS, 
  INMATE_VISIT_STATUSES 
} from '@/lib/validations/inmate';
import { createInmate, updateInmate, deleteInmate } from '@/actions/inmates';
import type { Inmate } from '@/types';

export default function InmatesPage() {
  const { toast } = useToast();
  
  // Table state
  const [inmates, setInmates] = React.useState<Inmate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [classification, setClassification] = React.useState<string>('all');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalInmates, setTotalInmates] = React.useState(0);
  const limit = 10;

  // Dialog states
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  
  const [selectedInmate, setSelectedInmate] = React.useState<Inmate | null>(null);
  
  // Excel Import state
  const [importMode, setImportMode] = React.useState<'append' | 'replace'>('append');
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importLoading, setImportLoading] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{
    imported: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // Fetch inmates
  const fetchInmates = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) params.append('search', search);
      if (classification !== 'all') params.append('classification', classification);

      const res = await fetch(`/api/v1/admin/inmates?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải danh sách phạm nhân.');
      }
      const json = await res.json();
      setInmates(json.data);
      setTotalPages(json.pagination.total_pages);
      setTotalInmates(json.pagination.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể kết nối đến máy chủ.';
      toast({
        title: 'Lỗi',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, classification, toast]);

  React.useEffect(() => {
    fetchInmates();
  }, [fetchInmates]);

  // React Hook Form for Add Inmate
  const {
    register: registerAdd,
    handleSubmit: handleSubmitAdd,
    formState: { errors: errorsAdd, isSubmitting: isSubmittingAdd },
    reset: resetAdd,
    setValue: setValueAdd,
    watch: watchAdd,
  } = useForm<InmateFormData>({
    resolver: zodResolver(inmateFormSchema),
    defaultValues: {
      prison_number: '',
      full_name: '',
      date_of_birth: '',
      citizen_id: '',
      permanent_address: '',
      criminal_offense: '',
      arrest_date: '',
      admission_date: '',
      classification: 'Phạm nhân',
      visit_status: 'Có thể thăm gặp',
    },
  });

  // React Hook Form for Edit Inmate
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit, isSubmitting: isSubmittingEdit },
    reset: resetEdit,
    setValue: setValueEdit,
    watch: watchEdit,
  } = useForm<InmateFormData>({
    resolver: zodResolver(inmateFormSchema),
  });

  // Watch fields for Select bindings
  const addClassification = watchAdd('classification');
  const addVisitStatus = watchAdd('visit_status');
  const editClassification = watchEdit('classification');
  const editVisitStatus = watchEdit('visit_status');

  const onAddSubmit = async (data: InmateFormData) => {
    const res = await createInmate(data);
    if (res.success) {
      toast({
        title: 'Thành công',
        description: 'Đã thêm phạm nhân mới.',
        variant: 'default',
      });
      setIsAddOpen(false);
      resetAdd();
      fetchInmates();
    } else {
      toast({
        title: 'Thất bại',
        description: res.message || 'Lỗi xảy ra khi lưu phạm nhân.',
        variant: 'destructive',
      });
    }
  };

  const onEditSubmit = async (data: InmateFormData) => {
    if (!selectedInmate) return;
    const res = await updateInmate(selectedInmate.id, data);
    if (res.success) {
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật thông tin phạm nhân.',
        variant: 'default',
      });
      setIsEditOpen(false);
      fetchInmates();
    } else {
      toast({
        title: 'Thất bại',
        description: res.message || 'Lỗi xảy ra khi lưu phạm nhân.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedInmate) return;
    const res = await deleteInmate(selectedInmate.id);
    if (res.success) {
      toast({
        title: 'Thành công',
        description: 'Đã xóa phạm nhân khỏi hệ thống.',
        variant: 'default',
      });
      setIsDeleteOpen(false);
      fetchInmates();
    } else {
      toast({
        title: 'Thất bại',
        description: res.message || 'Không thể xóa phạm nhân này.',
        variant: 'destructive',
      });
    }
  };

  const openEditModal = (inmate: Inmate) => {
    setSelectedInmate(inmate);
    resetEdit({
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
    setIsEditOpen(true);
  };

  const openDeleteModal = (inmate: Inmate) => {
    setSelectedInmate(inmate);
    setIsDeleteOpen(true);
  };

  // Handle Excel Import
  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('import_mode', importMode);

      const res = await fetch('/api/v1/admin/inmates/import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Lỗi khi nhập dữ liệu.');
      }

      setImportResult({
        imported: json.imported,
        skipped: json.skipped,
        errors: json.errors || [],
      });

      toast({
        title: 'Hoàn thành nhập dữ liệu',
        description: `Đã nhập thành công ${json.imported} phạm nhân.`,
        variant: 'default',
      });

      fetchInmates();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể xử lý tệp.';
      toast({
        title: 'Lỗi nhập dữ liệu',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-heading-xl font-bold tracking-tight text-ink">Quản lý phạm nhân</h1>
          <p className="text-caption-md text-mute">
            Danh sách và hồ sơ chi tiết của các phạm nhân trong trại giam ({totalInmates} hồ sơ).
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button 
            variant="outline" 
            onClick={() => setIsImportOpen(true)}
            className="rounded-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            Nhập Excel
          </Button>
          
          <Button 
            variant="outline"
            asChild
            className="rounded-full"
          >
            <a href="/api/v1/admin/inmates/export" download>
              <Download className="mr-2 h-4 w-4" />
              Xuất Excel
            </a>
          </Button>
          
          <Button 
            variant="default"
            onClick={() => {
              resetAdd();
              setIsAddOpen(true);
            }}
            className="rounded-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Thêm phạm nhân
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input
            placeholder="Tìm theo số hiệu hoặc họ tên..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 h-11 bg-canvas border border-hairline focus-ring rounded-md"
          />
        </div>
        
        <div className="w-full md:w-64">
          <Select 
            value={classification} 
            onValueChange={(val) => {
              setClassification(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Phân loại phạm nhân" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả phân loại</SelectItem>
              {INMATE_CLASSIFICATIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inmates List Table */}
      <div className="bg-canvas border border-hairline overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px] font-semibold">Số hiệu</TableHead>
              <TableHead className="font-semibold">Họ và tên</TableHead>
              <TableHead className="font-semibold">Ngày sinh</TableHead>
              <TableHead className="font-semibold">Phân loại</TableHead>
              <TableHead className="font-semibold">Trạng thái thăm gặp</TableHead>
              <TableHead className="w-[100px] text-right font-semibold">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-ink border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                  <p className="mt-2 text-caption-md text-mute">Đang tải dữ liệu...</p>
                </TableCell>
              </TableRow>
            ) : inmates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-mute text-body-md">
                  Không tìm thấy phạm nhân nào khớp với điều kiện lọc.
                </TableCell>
              </TableRow>
            ) : (
              inmates.map((inmate) => (
                <TableRow key={inmate.id} className="hover:bg-soft-cloud/30">
                  <TableCell className="font-mono text-body-strong">{inmate.prison_number}</TableCell>
                  <TableCell className="font-medium text-ink">{inmate.full_name}</TableCell>
                  <TableCell>{inmate.date_of_birth}</TableCell>
                  <TableCell>{inmate.classification}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption-sm font-medium ${
                        inmate.visit_status === 'Có thể thăm gặp'
                          ? 'bg-success/10 text-success'
                          : 'bg-sale/10 text-sale'
                      }`}
                    >
                      {inmate.visit_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(inmate)}
                        title="Sửa thông tin"
                        className="h-8 w-8 rounded-full"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteModal(inmate)}
                        title="Xóa"
                        className="h-8 w-8 rounded-full text-sale hover:text-sale hover:bg-sale/5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-hairline px-6 py-4 bg-canvas">
            <span className="text-caption-md text-mute">
              Hiển thị từ {(page - 1) * limit + 1} đến {Math.min(page * limit, totalInmates)} trong số {totalInmates} phạm nhân
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="h-9 w-9 rounded-full"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <Button
                  key={i}
                  variant={page === i + 1 ? 'default' : 'outline'}
                  onClick={() => setPage(i + 1)}
                  className={`h-9 w-9 rounded-full p-0 text-caption-md ${page === i + 1 ? 'font-semibold' : ''}`}
                >
                  {i + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="h-9 w-9 rounded-full"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Inmate Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl bg-canvas p-6 border border-hairline-soft rounded-none">
          <DialogHeader>
            <DialogTitle className="text-heading-lg font-bold">Thêm phạm nhân mới</DialogTitle>
            <DialogDescription className="text-body-md text-mute">
              Vui lòng điền đầy đủ các thông tin bắt buộc (*) dưới đây để lập hồ sơ phạm nhân mới.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitAdd(onAddSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-prison-number">Số hiệu phạm nhân *</Label>
                <Input
                  id="add-prison-number"
                  placeholder="Nhập số hiệu (ví dụ: PMN0123)"
                  {...registerAdd('prison_number')}
                  className={errorsAdd.prison_number ? 'border-sale' : ''}
                />
                {errorsAdd.prison_number && (
                  <p className="text-caption-sm text-sale">{errorsAdd.prison_number.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-full-name">Họ và tên phạm nhân *</Label>
                <Input
                  id="add-full-name"
                  placeholder="Nhập họ và tên có dấu"
                  {...registerAdd('full_name')}
                  className={errorsAdd.full_name ? 'border-sale' : ''}
                />
                {errorsAdd.full_name && (
                  <p className="text-caption-sm text-sale">{errorsAdd.full_name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-dob">Ngày sinh phạm nhân *</Label>
                <Input
                  id="add-dob"
                  type="date"
                  {...registerAdd('date_of_birth')}
                  className={errorsAdd.date_of_birth ? 'border-sale' : ''}
                />
                {errorsAdd.date_of_birth && (
                  <p className="text-caption-sm text-sale">{errorsAdd.date_of_birth.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-citizen-id">Số CCCD (12 chữ số)</Label>
                <Input
                  id="add-citizen-id"
                  placeholder="Nhập số căn cước"
                  maxLength={12}
                  {...registerAdd('citizen_id')}
                  className={errorsAdd.citizen_id ? 'border-sale' : ''}
                />
                {errorsAdd.citizen_id && (
                  <p className="text-caption-sm text-sale">{errorsAdd.citizen_id.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Phân loại phạm nhân *</Label>
                <Select
                  value={addClassification}
                  onValueChange={(val) => setValueAdd('classification', val as typeof INMATE_CLASSIFICATIONS[number])}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INMATE_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Trạng thái thăm gặp *</Label>
                <Select
                  value={addVisitStatus}
                  onValueChange={(val) => setValueAdd('visit_status', val as typeof INMATE_VISIT_STATUSES[number])}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INMATE_VISIT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-arrest-date">Ngày bắt tạm giam</Label>
                <Input
                  id="add-arrest-date"
                  type="date"
                  {...registerAdd('arrest_date')}
                  className={errorsAdd.arrest_date ? 'border-sale' : ''}
                />
                {errorsAdd.arrest_date && (
                  <p className="text-caption-sm text-sale">{errorsAdd.arrest_date.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-admission-date">Ngày nhập trại</Label>
                <Input
                  id="add-admission-date"
                  type="date"
                  {...registerAdd('admission_date')}
                  className={errorsAdd.admission_date ? 'border-sale' : ''}
                />
                {errorsAdd.admission_date && (
                  <p className="text-caption-sm text-sale">{errorsAdd.admission_date.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-address">Địa chỉ thường trú</Label>
              <Input
                id="add-address"
                placeholder="Nhập địa chỉ nhà, xã/phường, quận/huyện, tỉnh/thành phố..."
                {...registerAdd('permanent_address')}
                className={errorsAdd.permanent_address ? 'border-sale' : ''}
              />
              {errorsAdd.permanent_address && (
                <p className="text-caption-sm text-sale">{errorsAdd.permanent_address.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-offense">Tội danh truy tố / kết án</Label>
              <Input
                id="add-offense"
                placeholder="Ví dụ: Lạm dụng tín nhiệm chiếm đoạt tài sản"
                {...registerAdd('criminal_offense')}
                className={errorsAdd.criminal_offense ? 'border-sale' : ''}
              />
              {errorsAdd.criminal_offense && (
                <p className="text-caption-sm text-sale">{errorsAdd.criminal_offense.message}</p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-hairline-soft mt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAddOpen(false)}
                disabled={isSubmittingAdd}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={isSubmittingAdd}
              >
                {isSubmittingAdd ? 'Đang lưu...' : 'Thêm mới'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Inmate Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl bg-canvas p-6 border border-hairline-soft rounded-none">
          <DialogHeader>
            <DialogTitle className="text-heading-lg font-bold">Chỉnh sửa hồ sơ phạm nhân</DialogTitle>
            <DialogDescription className="text-body-md text-mute">
              Cập nhật thông tin chi tiết cho số hiệu: <span className="font-semibold font-mono text-ink">{selectedInmate?.prison_number}</span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-prison-number">Số hiệu phạm nhân *</Label>
                <Input
                  id="edit-prison-number"
                  placeholder="Nhập số hiệu"
                  {...registerEdit('prison_number')}
                  className={errorsEdit.prison_number ? 'border-sale' : ''}
                />
                {errorsEdit.prison_number && (
                  <p className="text-caption-sm text-sale">{errorsEdit.prison_number.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-full-name">Họ và tên phạm nhân *</Label>
                <Input
                  id="edit-full-name"
                  placeholder="Nhập họ và tên"
                  {...registerEdit('full_name')}
                  className={errorsEdit.full_name ? 'border-sale' : ''}
                />
                {errorsEdit.full_name && (
                  <p className="text-caption-sm text-sale">{errorsEdit.full_name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-dob">Ngày sinh phạm nhân *</Label>
                <Input
                  id="edit-dob"
                  type="date"
                  {...registerEdit('date_of_birth')}
                  className={errorsEdit.date_of_birth ? 'border-sale' : ''}
                />
                {errorsEdit.date_of_birth && (
                  <p className="text-caption-sm text-sale">{errorsEdit.date_of_birth.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-citizen-id">Số CCCD (12 chữ số)</Label>
                <Input
                  id="edit-citizen-id"
                  placeholder="Nhập số căn cước"
                  maxLength={12}
                  {...registerEdit('citizen_id')}
                  className={errorsEdit.citizen_id ? 'border-sale' : ''}
                />
                {errorsEdit.citizen_id && (
                  <p className="text-caption-sm text-sale">{errorsEdit.citizen_id.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Phân loại phạm nhân *</Label>
                <Select
                  value={editClassification}
                  onValueChange={(val) => setValueEdit('classification', val as typeof INMATE_CLASSIFICATIONS[number])}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INMATE_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Trạng thái thăm gặp *</Label>
                <Select
                  value={editVisitStatus}
                  onValueChange={(val) => setValueEdit('visit_status', val as typeof INMATE_VISIT_STATUSES[number])}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INMATE_VISIT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-arrest-date">Ngày bắt tạm giam</Label>
                <Input
                  id="edit-arrest-date"
                  type="date"
                  {...registerEdit('arrest_date')}
                  className={errorsEdit.arrest_date ? 'border-sale' : ''}
                />
                {errorsEdit.arrest_date && (
                  <p className="text-caption-sm text-sale">{errorsEdit.arrest_date.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-admission-date">Ngày nhập trại</Label>
                <Input
                  id="edit-admission-date"
                  type="date"
                  {...registerEdit('admission_date')}
                  className={errorsEdit.admission_date ? 'border-sale' : ''}
                />
                {errorsEdit.admission_date && (
                  <p className="text-caption-sm text-sale">{errorsEdit.admission_date.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Địa chỉ thường trú</Label>
              <Input
                id="edit-address"
                placeholder="Nhập địa chỉ nhà..."
                {...registerEdit('permanent_address')}
                className={errorsEdit.permanent_address ? 'border-sale' : ''}
              />
              {errorsEdit.permanent_address && (
                <p className="text-caption-sm text-sale">{errorsEdit.permanent_address.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-offense">Tội danh truy tố / kết án</Label>
              <Input
                id="edit-offense"
                placeholder="Ví dụ: Vi phạm quy định về tham gia giao thông"
                {...registerEdit('criminal_offense')}
                className={errorsEdit.criminal_offense ? 'border-sale' : ''}
              />
              {errorsEdit.criminal_offense && (
                <p className="text-caption-sm text-sale">{errorsEdit.criminal_offense.message}</p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-hairline-soft mt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditOpen(false)}
                disabled={isSubmittingEdit}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={isSubmittingEdit}
              >
                {isSubmittingEdit ? 'Đang lưu...' : 'Cập nhật'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Xác nhận xóa phạm nhân"
        description={`Bạn có chắc chắn muốn xóa phạm nhân "${selectedInmate?.full_name}" (Số hiệu: ${selectedInmate?.prison_number}) ra khỏi hệ thống? Hành động này sẽ chuyển trạng thái của hồ sơ này sang Đã xóa và ẩn đi.`}
        confirmLabel="Xóa hồ sơ"
        cancelLabel="Bỏ qua"
        destructive
        onConfirm={handleDeleteConfirm}
      />

      {/* Excel Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={(open) => {
        setIsImportOpen(open);
        if (!open) {
          setImportFile(null);
          setImportResult(null);
          setImportLoading(false);
        }
      }}>
        <DialogContent className="max-w-xl bg-canvas p-6 border border-hairline-soft rounded-none">
          <DialogHeader>
            <DialogTitle className="text-heading-lg font-bold">Nhập danh sách từ Excel</DialogTitle>
            <DialogDescription className="text-body-md text-mute">
              Tải lên bảng tính chứa thông tin danh sách phạm nhân để cập nhật số lượng lớn vào hệ thống.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-body-strong text-ink">Chế độ nhập dữ liệu *</Label>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-6">
                <label className="flex items-center gap-2.5 cursor-pointer text-body-md">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                    className="h-4 w-4 accent-ink"
                  />
                  <span>Ghi thêm (Bỏ qua số hiệu đã tồn tại)</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-body-md">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="h-4 w-4 accent-ink"
                  />
                  <span>Ghi đè (Xóa danh sách cũ và nhập mới)</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tệp bảng tính (.xlsx) *</Label>
              <FileUpload
                onFileSelect={(file) => setImportFile(file)}
                onFileClear={() => setImportFile(null)}
                loading={importLoading}
                disabled={importLoading}
              />
            </div>

            {/* Results block */}
            {importResult && (
              <div className="rounded-lg border border-hairline-soft bg-soft-cloud/50 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-success font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Kết quả xử lý tệp tin:</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-caption-md">
                  <div>
                    Số dòng đã nhập: <strong className="text-ink text-body-strong">{importResult.imported}</strong>
                  </div>
                  <div>
                    Số dòng bỏ qua: <strong className="text-mute">{importResult.skipped}</strong>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="space-y-1.5 border-t border-hairline pt-2">
                    <p className="text-caption-sm font-semibold text-sale flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Chi tiết lỗi hàng loạt ({importResult.errors.length} dòng):
                    </p>
                    <div className="max-h-24 overflow-y-auto rounded bg-canvas border border-hairline p-2 text-utility-xs space-y-1 text-sale font-mono">
                      {importResult.errors.map((err, i) => (
                        <div key={i}>{err.message}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-hairline-soft mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsImportOpen(false)}
              disabled={importLoading}
            >
              Đóng
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleImportSubmit}
              disabled={importLoading || !importFile}
            >
              {importLoading ? 'Đang nhập...' : 'Bắt đầu nhập'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
