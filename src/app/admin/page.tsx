'use client';

import * as React from 'react';
import { 
  Search, 
  Download, 
  Calendar, 
  Eye, 
  FileText, 
  Check, 
  UserX,
  Clock,
  User,
  ShieldAlert
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
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
import { updateRegistrationStatus } from '@/actions/registrations';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateVN, toTitleCaseName } from '@/lib/format';
import type { VisitRegistration } from '@/types';

interface VisitorDetail {
  id: string;
  full_name: string;
  date_of_birth: string;
  citizen_id: string;
  relationship: string;
  display_order: number;
}

interface RegistrationWithRelations extends Omit<VisitRegistration, 'inmate_id'> {
  inmate: {
    id: string;
    prison_number: string;
    full_name: string;
  };
  visitors: VisitorDetail[];
}

export default function AdminDashboardPage() {
  const { toast } = useToast();

  // State
  const [registrations, setRegistrations] = React.useState<RegistrationWithRelations[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalRegs, setTotalRegs] = React.useState(0);
  const limit = 10;

  // Dialog State
  const [selectedReg, setSelectedReg] = React.useState<RegistrationWithRelations | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [highlightedRegistrationId, setHighlightedRegistrationId] = React.useState<string | null>(null);
  const highlightTimeoutRef = React.useRef<number | null>(null);

  // Fetch registrations
  const fetchRegistrations = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) params.append('search', search);
      if (status !== 'all') params.append('status', status);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);

      const res = await fetch(`/api/v1/admin/registrations?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải danh sách đăng ký.');
      }
      const json = await res.json();
      setRegistrations(json.data);
      setTotalPages(json.pagination.total_pages);
      setTotalRegs(json.pagination.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể thực hiện hành động.';
      toast({
        title: 'Lỗi',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, status, dateFrom, dateTo, toast]);

  React.useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  // Keep the latest fetchRegistrations in a ref so the realtime subscription can
  // be created exactly once on mount without re-subscribing on every filter change.
  const fetchRegistrationsRef = React.useRef(fetchRegistrations);
  React.useEffect(() => {
    fetchRegistrationsRef.current = fetchRegistrations;
  }, [fetchRegistrations]);

  React.useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      return undefined;
    }

    // Realtime `postgres_changes` events are filtered by RLS. The
    // `admin_visit_registrations_prison` policy keys off the `prison_id` claim
    // in the admin's JWT, so the realtime socket MUST authenticate with the
    // logged-in user's access token — otherwise it connects as `anon` (no
    // `prison_id`), every INSERT/UPDATE is filtered out, and the list never
    // syncs. Push the token before subscribing and refresh it on token rotation.
    //
    // The channel is set up ONCE on mount. `.on(...)` handlers must be attached
    // before `.subscribe()`; re-running this effect (or racing an async token
    // fetch against teardown) would attempt to reuse the same topic after it is
    // already subscribed and throw "cannot add postgres_changes callbacks ...".
    let cancelled = false;
    let registrationChannel: ReturnType<typeof supabase.channel> | null = null;

    const handleInsert = (payload: { new: Record<string, unknown> }) => {
      const record = payload.new as Record<string, unknown>;
      if (record?.id && typeof record.id === 'string') {
        setHighlightedRegistrationId(record.id);
        fetchRegistrationsRef.current();
        if (highlightTimeoutRef.current) {
          window.clearTimeout(highlightTimeoutRef.current);
        }
        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlightedRegistrationId(null);
          highlightTimeoutRef.current = null;
        }, 5000);
      }
    };

    const handleUpdate = (payload: { new: Record<string, unknown> }) => {
      const record = payload.new as Record<string, unknown>;
      if (record?.id && typeof record.id === 'string') {
        fetchRegistrationsRef.current();
      }
    };

    const setupSubscription = () => {
      if (cancelled) return;
      registrationChannel = supabase
        .channel('admin-visit-registrations')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_registrations' }, handleInsert)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visit_registrations' }, handleUpdate)
        .subscribe();
    };

    // Authenticate the realtime socket with the current session, then subscribe.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) {
        supabase.realtime.setAuth(token);
      }
      setupSubscription();
    });

    // Keep the realtime token in sync when Supabase refreshes the session.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      cancelled = true;
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      authListener.subscription.unsubscribe();
      if (registrationChannel) {
        supabase.removeChannel(registrationChannel);
      }
    };
  }, []);

  // Handle status update
  const handleStatusChange = async (newStatus: 'completed' | 'no_show') => {
    if (!selectedReg) return;
    setActionLoading(true);
    try {
      const res = await updateRegistrationStatus(selectedReg.id, newStatus);
      if (res.success) {
        toast({
          title: 'Thành công',
          description: `Đã cập nhật trạng thái lịch hẹn thành ${
            newStatus === 'completed' ? 'Đã hoàn thành' : 'Vắng mặt'
          }.`,
          variant: 'default',
        });
        
        // Refresh details modal local state
        const updatedReg = { ...selectedReg, status: newStatus };
        setSelectedReg(updatedReg);
        
        // Refresh table list
        fetchRegistrations();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Lỗi xảy ra khi cập nhật trạng thái.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể lưu thay đổi.';
      toast({
        title: 'Lỗi hệ thống',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openDetailsModal = (reg: RegistrationWithRelations) => {
    setSelectedReg(reg);
    setIsDetailsOpen(true);
  };

  // Map status → Badge variant
  const getStatusVariant = (statusVal: string): BadgeVariant => {
    switch (statusVal) {
      case 'confirmed':
        return 'info';
      case 'completed':
        return 'success';
      case 'no_show':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getStatusLabel = (statusVal: string) => {
    switch (statusVal) {
      case 'confirmed':
        return 'Đã xác nhận';
      case 'completed':
        return 'Đã hoàn thành';
      case 'no_show':
        return 'Vắng mặt';
      default:
        return statusVal;
    }
  };

  // Build bulk export URL
  const exportUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status !== 'all') params.append('status', status);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    return `/api/v1/admin/registrations/export?${params.toString()}`;
  }, [search, status, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-heading-xl font-bold tracking-tight text-ink">Danh sách đăng ký thăm gặp</h1>
          <p className="text-caption-md text-mute">
            Theo dõi, quản lý và cập nhật trạng thái các buổi gặp mặt của thân nhân với người bị giam giữ ({totalRegs} lịch hẹn).
          </p>
        </div>
        <div>
          <Button variant="outline" asChild>
            <a href={exportUrl} download>
              <Download className="mr-2 h-4 w-4" />
              Xuất danh sách Excel
            </a>
          </Button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="space-y-4">
        {/* Status Tabs */}
        <div className="flex border-b border-hairline overflow-x-auto whitespace-nowrap">
          {[
            { value: 'all', label: 'Tất cả' },
            { value: 'confirmed', label: 'Đã xác nhận' },
            { value: 'completed', label: 'Đã hoàn thành' },
            { value: 'no_show', label: 'Vắng mặt' },
          ].map((tab) => {
            const isActive = status === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
                className={`-mb-px border-b-2 px-4 py-2.5 text-caption-md font-semibold transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-mute hover:text-charcoal'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
          {/* Search bar */}
          <div className="relative md:col-span-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <Input
              placeholder="Tìm theo số giam, tên người bị giam giữ hoặc người thân..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-11 pl-9"
            />
          </div>

          {/* Date Pickers */}
          <div className="grid grid-cols-2 gap-2 md:col-span-6">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute pointer-events-none" />
              <DateInput
                value={dateFrom}
                onChange={(iso) => {
                  setDateFrom(iso);
                  setPage(1);
                }}
                aria-label="Từ ngày"
                className="h-11 pl-9 text-caption-md"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute pointer-events-none" />
              <DateInput
                value={dateTo}
                onChange={(iso) => {
                  setDateTo(iso);
                  setPage(1);
                }}
                aria-label="Đến ngày"
                className="h-11 pl-9 text-caption-md"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Registrations List Table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px] font-semibold">Mã lịch hẹn</TableHead>
              <TableHead className="font-semibold">Thân nhân liên hệ</TableHead>
              <TableHead className="font-semibold">Người bị giam giữ</TableHead>
              <TableHead className="font-semibold">Ngày thăm gặp</TableHead>
              <TableHead className="font-semibold">Ca giờ hẹn</TableHead>
              <TableHead className="font-semibold">Trạng thái</TableHead>
              <TableHead className="w-[80px] text-right font-semibold">Chi tiết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                  <p className="mt-2 text-caption-md text-mute">Đang tải danh sách đăng ký...</p>
                </TableCell>
              </TableRow>
            ) : registrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={Search}
                    title="Không tìm thấy lịch hẹn"
                    description="Không có lịch hẹn nào phù hợp với bộ lọc hiện tại. Thử điều chỉnh từ khóa tìm kiếm hoặc khoảng ngày."
                  />
                </TableCell>
              </TableRow>
            ) : (
              registrations.map((reg) => {
                const primaryVisitor = toTitleCaseName(reg.visitors?.find(v => v.display_order === 1)?.full_name) || 'N/A';
                const visitorsCount = reg.visitors?.length || 0;
                const visitorLabel = visitorsCount > 1 
                  ? `${primaryVisitor} (+${visitorsCount - 1} người)` 
                  : primaryVisitor;
                const isHighlighted = reg.id === highlightedRegistrationId;

                return (
                  <TableRow 
                    key={reg.id} 
                    className={`cursor-pointer transition-colors duration-200 hover:bg-soft-cloud/60 ${isHighlighted ? 'bg-success-soft ring-2 ring-success/30' : ''}`}
                    onClick={() => openDetailsModal(reg)}
                  >
                    <TableCell className="font-mono text-caption-sm text-mute">
                      {reg.id.substring(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell className="font-semibold text-ink">{visitorLabel}</TableCell>
                    <TableCell>
                      <p className="font-medium text-ink">{toTitleCaseName(reg.inmate?.full_name)}</p>
                      <p className="text-caption-sm text-mute font-mono">{reg.inmate?.prison_number}</p>
                    </TableCell>
                    <TableCell className="font-medium">{formatDateVN(reg.visit_date)}</TableCell>
                    <TableCell className="font-mono text-caption-md">
                      {reg.time_slot_start.substring(0, 5)} - {reg.time_slot_end.substring(0, 5)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(reg.status)} dot>
                        {getStatusLabel(reg.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDetailsModal(reg)}
                        className="h-8 w-8"
                        title="Xem chi tiết"
                        aria-label="Xem chi tiết đăng ký"
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-hairline px-4 py-4 sm:flex-row sm:px-6">
            <span className="text-caption-md text-mute">
              Hiển thị từ {(page - 1) * limit + 1} đến {Math.min(page * limit, totalRegs)} trong số {totalRegs} lịch hẹn
            </span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Registration Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-heading-lg font-bold">Chi tiết phiếu đăng ký thăm gặp</DialogTitle>
            <DialogDescription className="text-body-md text-mute font-mono">
              MÃ LỊCH HẸN: {selectedReg?.id.toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          {selectedReg && (
            <div className="space-y-6 my-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-hairline-soft pb-5">
                {/* Column 1: Inmate */}
                <div className="space-y-2.5">
                  <h3 className="text-body-strong font-bold text-ink flex items-center gap-2">
                    <User className="h-4 w-4 text-mute" />
                    Hồ sơ người bị giam giữ
                  </h3>
                  <div className="space-y-1 text-caption-md bg-soft-cloud/40 border border-hairline-soft p-3">
                    <p>Họ tên: <strong className="text-ink">{toTitleCaseName(selectedReg.inmate?.full_name)}</strong></p>
                    <p>Số giam: <span className="font-mono text-ink font-semibold">{selectedReg.inmate?.prison_number}</span></p>
                  </div>
                </div>

                {/* Column 2: Date & Slot */}
                <div className="space-y-2.5">
                  <h3 className="text-body-strong font-bold text-ink flex items-center gap-2">
                    <Clock className="h-4 w-4 text-mute" />
                    Lịch hẹn thăm gặp
                  </h3>
                  <div className="space-y-1 text-caption-md bg-soft-cloud/40 border border-hairline-soft p-3">
                    <p>Ngày thăm: <strong className="text-ink">{formatDateVN(selectedReg.visit_date)}</strong></p>
                    <p>Giờ hẹn: <span className="font-semibold text-ink font-mono">{selectedReg.time_slot_start.substring(0, 5)} - {selectedReg.time_slot_end.substring(0, 5)}</span></p>
                    <p className="mt-0.5 flex items-center gap-1.5">Trạng thái: 
                      <Badge variant={getStatusVariant(selectedReg.status)} dot>
                        {getStatusLabel(selectedReg.status)}
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>

              {/* Visitors list */}
              <div className="space-y-3">
                <h3 className="text-body-strong font-bold text-ink">Danh sách người thăm gặp ({selectedReg.visitors?.length})</h3>
                <div className="border border-hairline overflow-hidden">
                  <Table>
                    <TableHeader className="bg-soft-cloud/30">
                      <TableRow>
                        <TableHead className="h-9 py-1 font-semibold">STT</TableHead>
                        <TableHead className="h-9 py-1 font-semibold">Họ và tên</TableHead>
                        <TableHead className="h-9 py-1 font-semibold">Ngày sinh</TableHead>
                        <TableHead className="h-9 py-1 font-semibold">Số CCCD</TableHead>
                        <TableHead className="h-9 py-1 font-semibold">Quan hệ với người bị giam giữ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReg.visitors?.sort((a, b) => a.display_order - b.display_order).map((vis, i) => (
                        <TableRow key={vis.id} className="hover:bg-soft-cloud/20">
                          <TableCell className="py-2 text-caption-md font-mono">{i + 1}</TableCell>
                          <TableCell className="py-2 text-caption-md font-semibold text-ink">{toTitleCaseName(vis.full_name)}</TableCell>
                          <TableCell className="py-2 text-caption-md">{formatDateVN(vis.date_of_birth)}</TableCell>
                          <TableCell className="py-2 text-caption-md font-mono">{vis.citizen_id}</TableCell>
                          <TableCell className="py-2 text-caption-md">{vis.relationship}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Notes */}
              {selectedReg.notes && (
                <div className="rounded-lg border border-hairline-soft bg-soft-cloud/30 p-3 space-y-1">
                  <p className="text-caption-sm font-semibold text-mute uppercase tracking-wide">Ghi chú</p>
                  <p className="text-caption-md text-charcoal">{selectedReg.notes}</p>
                </div>
              )}

              {/* Download slip */}
              <div className="space-y-2 border-t border-hairline-soft pt-4">
                <p className="text-caption-sm font-bold text-ink">Tải file giấy hẹn thăm gặp:</p>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    asChild
                  >
                    <a href={`/api/v1/admin/registrations/${selectedReg.id}/pdf`} target="_blank" rel="noreferrer">
                      <FileText className="mr-1.5 h-4 w-4" />
                      Giấy hẹn PDF
                    </a>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                  >
                    <a href={`/api/v1/admin/registrations/${selectedReg.id}/docx`} download>
                      <FileText className="mr-1.5 h-4 w-4" />
                      Giấy hẹn Word (.docx)
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-hairline-soft mt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
              {/* Status Action Buttons */}
              <div className="flex gap-2">
                {selectedReg?.status === 'confirmed' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleStatusChange('completed')}
                      disabled={actionLoading}
                      className="bg-success text-on-primary hover:bg-success/90"
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Đã hoàn thành
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange('no_show')}
                      disabled={actionLoading}
                      className="border-danger/30 text-danger hover:border-danger/50 hover:bg-danger-soft"
                    >
                      <UserX className="mr-1 h-4 w-4" />
                      Vắng mặt (No-Show)
                    </Button>
                  </>
                )}
                {selectedReg?.status !== 'confirmed' && (
                  <p className="text-caption-sm text-mute flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Không thể đổi trạng thái của lịch hẹn đã hoàn thành / vắng mặt.
                  </p>
                )}
              </div>
              
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsDetailsOpen(false)}
              >
                Đóng
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
