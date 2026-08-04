'use client';

import * as React from 'react';
import {
  Building2,
  Loader2,
  Plus,
  ShieldCheck,
  UserCog,
  UserX,
  UserCheck,
} from 'lucide-react';

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
import { useToast } from '@/hooks/use-toast';
import {
  createAdminAccount,
  listAdmins,
  listPrisons,
  setAdminActive,
  setAdminPrisons,
} from '@/actions/super-admin';
import type { AdminAccount, PrisonWithAdminCount } from '@/types';

export default function SuperAdminPage() {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [admins, setAdmins] = React.useState<AdminAccount[]>([]);
  const [prisons, setPrisons] = React.useState<PrisonWithAdminCount[]>([]);

  // ── Assign-prisons dialog state ──
  const [assignTarget, setAssignTarget] = React.useState<AdminAccount | null>(null);
  const [assignSelection, setAssignSelection] = React.useState<string[]>([]);
  const [assignSaving, setAssignSaving] = React.useState(false);

  // ── Toggle-active state ──
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  // ── Create-admin dialog state ──
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createSaving, setCreateSaving] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    email: '',
    password: '',
    full_name: '',
    role: 'admin' as 'admin' | 'super_admin',
    prison_ids: [] as string[],
  });

  const activePrisons = React.useMemo(
    () => prisons.filter((p) => p.is_active),
    [prisons],
  );

  const load = React.useCallback(async () => {
    const [adminsRes, prisonsRes] = await Promise.all([listAdmins(), listPrisons()]);
    if (adminsRes.success && adminsRes.data) {
      setAdmins(adminsRes.data);
    } else {
      toast({
        title: 'Lỗi',
        description: adminsRes.message || 'Không thể tải danh sách quản trị viên.',
        variant: 'destructive',
      });
    }
    if (prisonsRes.success && prisonsRes.data) {
      setPrisons(prisonsRes.data);
    }
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openAssignDialog = (admin: AdminAccount) => {
    setAssignTarget(admin);
    setAssignSelection(admin.assigned_prisons.map((p) => p.id));
  };

  const toggleAssignPrison = (prisonId: string) => {
    setAssignSelection((prev) =>
      prev.includes(prisonId)
        ? prev.filter((id) => id !== prisonId)
        : [...prev, prisonId],
    );
  };

  const onSaveAssignments = async () => {
    if (!assignTarget) return;
    setAssignSaving(true);
    try {
      const res = await setAdminPrisons(assignTarget.id, assignSelection);
      if (res.success) {
        toast({ title: 'Thành công', description: res.message });
        setAssignTarget(null);
        await load();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message,
          variant: 'destructive',
        });
      }
    } finally {
      setAssignSaving(false);
    }
  };

  const onToggleActive = async (admin: AdminAccount) => {
    setTogglingId(admin.id);
    try {
      const res = await setAdminActive(admin.id, !admin.is_active);
      if (res.success) {
        toast({ title: 'Thành công', description: res.message });
        await load();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message,
          variant: 'destructive',
        });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const toggleCreatePrison = (prisonId: string) => {
    setCreateForm((prev) => ({
      ...prev,
      prison_ids: prev.prison_ids.includes(prisonId)
        ? prev.prison_ids.filter((id) => id !== prisonId)
        : [...prev.prison_ids, prisonId],
    }));
  };

  const onCreateAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateSaving(true);
    try {
      const res = await createAdminAccount(createForm);
      if (res.success) {
        toast({ title: 'Thành công', description: res.message });
        setCreateOpen(false);
        setCreateForm({
          email: '',
          password: '',
          full_name: '',
          role: 'admin',
          prison_ids: [],
        });
        await load();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message,
          variant: 'destructive',
        });
      }
    } finally {
      setCreateSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-mute">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Đang tải danh sách quản trị viên…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-heading-xl font-bold tracking-tight text-ink">
            Quản lý quản trị viên
          </h1>
          <p className="text-caption-md text-mute">
            Phân công trại giam, kích hoạt tài khoản và tạo quản trị viên mới.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo quản trị viên
        </Button>
      </div>

      {/* Admins table */}
      <div className="rounded-lg border border-hairline bg-surface shadow-sm">
        {admins.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Chưa có quản trị viên"
            description="Tạo tài khoản quản trị viên đầu tiên để bắt đầu."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quản trị viên</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trại giam được phân công</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => {
                const isSuper = admin.role === 'super_admin';
                return (
                  <TableRow key={admin.id}>
                    <TableCell>
                      <p className="font-semibold text-ink">{admin.full_name}</p>
                      <p className="text-caption-sm text-mute">{admin.email}</p>
                    </TableCell>
                    <TableCell>
                      {isSuper ? (
                        <Badge variant="gold">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Cấp cao
                        </Badge>
                      ) : (
                        <Badge variant="default">Quản trị viên</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuper ? (
                        <span className="text-caption-sm text-mute">—</span>
                      ) : admin.assigned_prisons.length === 0 ? (
                        <span className="text-caption-sm text-warning">
                          Chưa phân công
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {admin.assigned_prisons.map((p) => (
                            <Badge
                              key={p.id}
                              variant={p.id === admin.prison_id ? 'success' : 'neutral'}
                              title={
                                p.id === admin.prison_id
                                  ? 'Trại giam đang làm việc'
                                  : undefined
                              }
                            >
                              {p.code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {admin.is_active ? (
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
                      <div className="flex items-center justify-end gap-2">
                        {!isSuper && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAssignDialog(admin)}
                          >
                            <Building2 className="mr-1.5 h-4 w-4" />
                            Phân công
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={togglingId === admin.id}
                          onClick={() => onToggleActive(admin)}
                        >
                          {togglingId === admin.id ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : admin.is_active ? (
                            <UserX className="mr-1.5 h-4 w-4" />
                          ) : (
                            <UserCheck className="mr-1.5 h-4 w-4" />
                          )}
                          {admin.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Assign prisons dialog ── */}
      <Dialog
        open={Boolean(assignTarget)}
        onOpenChange={(open) => !open && setAssignTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phân công trại giam</DialogTitle>
            <DialogDescription>
              Chọn các trại giam mà{' '}
              <span className="font-semibold text-ink">
                {assignTarget?.full_name}
              </span>{' '}
              được phép quản lý. Quản trị viên tự chuyển trại trong phần cài đặt
              tài khoản.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto py-1">
            {activePrisons.length === 0 ? (
              <p className="text-caption-md text-mute">
                Chưa có trại giam nào đang hoạt động.
              </p>
            ) : (
              activePrisons.map((prison) => {
                const checked = assignSelection.includes(prison.id);
                return (
                  <label
                    key={prison.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-hairline px-3.5 py-2.5 transition-colors hover:bg-soft-cloud"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignPrison(prison.id)}
                      className="h-4 w-4 accent-[var(--primary,#1d4ed8)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-caption-md font-medium text-ink">
                        {prison.name}
                      </span>
                      <span className="block text-caption-sm text-mute">
                        {prison.code}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignTarget(null)}
              disabled={assignSaving}
            >
              Hủy
            </Button>
            <Button
              onClick={onSaveAssignments}
              disabled={assignSaving || assignSelection.length === 0}
            >
              {assignSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu phân công
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create admin dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo quản trị viên mới</DialogTitle>
            <DialogDescription>
              Tài khoản được tạo với email đã xác nhận và có thể đăng nhập ngay.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateAdmin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ca-email">Email *</Label>
              <Input
                id="ca-email"
                type="email"
                required
                autoComplete="off"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-password">Mật khẩu *</Label>
              <Input
                id="ca-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Tối thiểu 8 ký tự"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-name">Tên hiển thị *</Label>
              <Input
                id="ca-name"
                type="text"
                required
                value={createForm.full_name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
                placeholder="Nhập tên hiển thị"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vai trò *</Label>
              <Select
                value={createForm.role}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    role: value as 'admin' | 'super_admin',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Quản trị viên</SelectItem>
                  <SelectItem value="super_admin">Quản trị viên cấp cao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.role === 'admin' && (
              <div className="space-y-1.5">
                <Label>Trại giam được phân công *</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {activePrisons.map((prison) => {
                    const checked = createForm.prison_ids.includes(prison.id);
                    return (
                      <label
                        key={prison.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-hairline px-3.5 py-2 transition-colors hover:bg-soft-cloud"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCreatePrison(prison.id)}
                          className="h-4 w-4"
                        />
                        <span className="truncate text-caption-md text-ink">
                          {prison.name} ({prison.code})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createSaving}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={
                  createSaving ||
                  (createForm.role === 'admin' && createForm.prison_ids.length === 0)
                }
              >
                {createSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tạo tài khoản
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
