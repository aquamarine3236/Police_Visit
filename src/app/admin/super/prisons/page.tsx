'use client';

import * as React from 'react';
import { Building2, Loader2, Pencil, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { listPrisons, upsertPrison } from '@/actions/super-admin';
import type { PrisonWithAdminCount } from '@/types';

interface PrisonFormState {
  id: string | null;
  name: string;
  code: string;
  address: string;
  phone: string;
  is_active: boolean;
}

const EMPTY_FORM: PrisonFormState = {
  id: null,
  name: '',
  code: '',
  address: '',
  phone: '',
  is_active: true,
};

export default function SuperAdminPrisonsPage() {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [prisons, setPrisons] = React.useState<PrisonWithAdminCount[]>([]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<PrisonFormState>(EMPTY_FORM);

  const load = React.useCallback(async () => {
    const res = await listPrisons();
    if (res.success && res.data) {
      setPrisons(res.data);
    } else {
      toast({
        title: 'Lỗi',
        description: res.message || 'Không thể tải danh sách trại giam.',
        variant: 'destructive',
      });
    }
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (prison: PrisonWithAdminCount) => {
    setForm({
      id: prison.id,
      name: prison.name,
      code: prison.code,
      address: prison.address ?? '',
      phone: prison.phone ?? '',
      is_active: prison.is_active,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await upsertPrison({
        id: form.id,
        name: form.name,
        code: form.code,
        address: form.address || null,
        phone: form.phone || null,
        is_active: form.is_active,
      });
      if (res.success) {
        toast({ title: 'Thành công', description: res.message });
        setDialogOpen(false);
        await load();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message,
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-mute">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Đang tải danh sách trại giam…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-heading-xl font-bold tracking-tight text-ink">
            Quản lý trại giam
          </h1>
          <p className="text-caption-md text-mute">
            Tạo mới, chỉnh sửa thông tin và kích hoạt/vô hiệu hóa trại giam.
            Trại giam không thể xóa — hãy vô hiệu hóa khi ngừng sử dụng.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo trại giam
        </Button>
      </div>

      {/* Prisons table */}
      <div className="rounded-lg border border-hairline bg-surface shadow-sm">
        {prisons.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Chưa có trại giam"
            description="Tạo trại giam đầu tiên để phân công cho quản trị viên."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trại giam</TableHead>
                <TableHead>Địa chỉ</TableHead>
                <TableHead>Điện thoại</TableHead>
                <TableHead>Quản trị viên</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prisons.map((prison) => (
                <TableRow key={prison.id}>
                  <TableCell>
                    <p className="font-semibold text-ink">{prison.name}</p>
                    <p className="text-caption-sm text-mute">{prison.code}</p>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-caption-md text-charcoal">
                    {prison.address || '—'}
                  </TableCell>
                  <TableCell className="text-caption-md text-charcoal">
                    {prison.phone || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{prison.admin_count}</Badge>
                  </TableCell>
                  <TableCell>
                    {prison.is_active ? (
                      <Badge variant="success" dot>
                        Hoạt động
                      </Badge>
                    ) : (
                      <Badge variant="danger" dot>
                        Vô hiệu hóa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(prison)}>
                      <Pencil className="mr-1.5 h-4 w-4" />
                      Chỉnh sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Create / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id ? 'Chỉnh sửa trại giam' : 'Tạo trại giam mới'}
            </DialogTitle>
            <DialogDescription>
              Mã trại giam phải là duy nhất trong hệ thống.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prison-name">Tên trại giam *</Label>
              <Input
                id="prison-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="VD: Trại giam NK"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prison-code">Mã trại giam *</Label>
              <Input
                id="prison-code"
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="VD: PRISON-003"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prison-address">Địa chỉ</Label>
              <Input
                id="prison-address"
                type="text"
                value={form.address}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="Nhập địa chỉ"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prison-phone">Điện thoại</Label>
              <Input
                id="prison-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Nhập số điện thoại"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-hairline px-3.5 py-2.5 transition-colors hover:bg-soft-cloud">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, is_active: e.target.checked }))
                }
                className="h-4 w-4"
              />
              <span className="text-caption-md text-ink">Đang hoạt động</span>
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.id ? 'Lưu thay đổi' : 'Tạo trại giam'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
