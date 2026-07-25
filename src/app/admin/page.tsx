'use client';

import * as React from 'react';
import { 
  Search, 
  Download, 
  Eye, 
  FileText, 
  Check, 
  UserX,
  Clock,
  User,
  ShieldAlert,
  Trash2,
  Loader2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
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
import { updateRegistrationStatus, deleteRegistration } from '@/actions/registrations';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateVN, toTitleCaseName, addDaysISO } from '@/lib/format';
import { hasSlotEndedVN } from '@/lib/time';
import type { VisitRegistration } from '@/types';

interface VisitorDetail {
  id: string;
  full_name: string;
  date_of_birth: string | null;
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
  const { download: downloadExport, downloading: exporting } = useFileDownload();

  // State
  const [registrations, setRegistrations] = React.useState<RegistrationWithRelations[]>([]);
  const [loading, setLoading] = React.useState(true);
  // `hasLoadedOnce` gates the skeleton: only the very first load shows it.
  // Subsequent filter/search/page changes keep the previous rows visible
  // (dimmed) so the table never collapses — this removes the flash of an empty
  // table and makes the UI feel instantly responsive.
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false);
  const [search, setSearch] = React.useState('');
  // The raw `search` drives the controlled input (instant typing); the fetch is
  // driven by the debounced value so we don't fire a request on every keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = React.useState<string>('all');
  // Only dim the table for refetches that actually take a moment (>150ms),
  // so fast filter changes don't produce a visible flicker.
  const showRefetchDim = useDelayedFlag(loading && hasLoadedOnce, 150);
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
  // Delete confirmation state
  const [regToDelete, setRegToDelete] = React.useState<RegistrationWithRelations | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [highlightedRegistrationId, setHighlightedRegistrationId] = React.useState<string | null>(null);
  const highlightTimeoutRef = React.useRef<number | null>(null);

  // Fetch registrations.
  //
  // `silent` refreshes (realtime events, polling, tab re-focus) skip the loading
  // spinner and the error toast so an auto-update never blanks the table or
  // interrupts the admin. The query is always built from the CURRENT filter /
  // search / page state, so those are preserved across every refresh. New rows
  // sort to the top because the API defaults to `created_at desc`.
  const fetchRegistrations = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (debouncedSearch) params.append('search', debouncedSearch);
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
      setHasLoadedOnce(true);
    } catch (err) {
      // Never surface transient background-refresh failures as toasts; the next
      // poll (or realtime event) will reconcile the list.
      if (!silent) {
        const message = err instanceof Error ? err.message : 'Không thể thực hiện hành động.';
        toast({
          title: 'Lỗi',
          description: message,
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, debouncedSearch, status, dateFrom, dateTo, toast]);

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

    // Poll cadences: tight when realtime is NOT confirmed healthy (so the list
    // still updates within seconds), relaxed when realtime is SUBSCRIBED (a
    // low-frequency safety net that reconciles anything a dropped event missed).
    const POLL_MS_FALLBACK = 10_000;
    const POLL_MS_HEALTHY = 60_000;

    let cancelled = false;
    let registrationChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let pollTimer: number | null = null;
    // Realtime is considered healthy only after the channel reports SUBSCRIBED.
    let realtimeHealthy = false;

    const silentRefresh = () => {
      // Never refresh a hidden tab; the visibilitychange handler refreshes once
      // on re-focus instead, avoiding needless load while nobody is watching.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchRegistrationsRef.current({ silent: true });
    };

    // (Re)arm the polling interval at the cadence matching realtime health.
    const startPolling = (intervalMs: number) => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      pollTimer = window.setInterval(silentRefresh, intervalMs);
    };

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    // Refresh immediately when the admin returns to the tab so they see the
    // latest state without waiting for the next poll tick.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        silentRefresh();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Start the fallback poller straight away. If realtime later confirms it is
    // SUBSCRIBED we relax the cadence; if it errors/closes we tighten it again.
    startPolling(POLL_MS_FALLBACK);

    // ── Realtime subscription (primary path) ────────────────────────────────
    // `postgres_changes` events are filtered by RLS. The
    // `admin_visit_registrations_prison` policy keys off the `prison_id` claim
    // in the admin's JWT, so the realtime socket MUST authenticate with the
    // logged-in user's access token — otherwise it connects as `anon` (no
    // `prison_id`), every INSERT/UPDATE is filtered out, and only the polling
    // fallback keeps the list in sync. Push the token before subscribing and
    // refresh it on token rotation.
    //
    // NOTE: on hosted Supabase the `custom_access_token_hook` must ALSO be
    // enabled in the dashboard (Authentication → Hooks); config.toml only wires
    // it for local. If it is off, JWTs carry no `prison_id`, realtime events are
    // RLS-filtered out, and the fallback poller (above) is what keeps sync.
    //
    // The channel is set up ONCE on mount. `.on(...)` handlers must be attached
    // before `.subscribe()`; re-running this effect (or racing an async token
    // fetch against teardown) would attempt to reuse the same topic after it is
    // already subscribed and throw "cannot add postgres_changes callbacks ...".
    let authListener: ReturnType<NonNullable<typeof supabase>['auth']['onAuthStateChange']>['data'] | null = null;

    if (supabase) {
      const handleInsert = (payload: { new: Record<string, unknown> }) => {
        const record = payload.new as Record<string, unknown>;
        if (record?.id && typeof record.id === 'string') {
          setHighlightedRegistrationId(record.id);
          silentRefresh();
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
          silentRefresh();
        }
      };

      const setupSubscription = () => {
        if (cancelled) return;
        registrationChannel = supabase
          .channel('admin-visit-registrations')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_registrations' }, handleInsert)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visit_registrations' }, handleUpdate)
          .subscribe((subscribeStatus) => {
            if (cancelled) return;
            if (subscribeStatus === 'SUBSCRIBED') {
              // Realtime is live: relax polling to a low-frequency reconcile and
              // pull once immediately in case an event fired before we attached.
              realtimeHealthy = true;
              startPolling(POLL_MS_HEALTHY);
              silentRefresh();
            } else if (
              subscribeStatus === 'CHANNEL_ERROR' ||
              subscribeStatus === 'TIMED_OUT' ||
              subscribeStatus === 'CLOSED'
            ) {
              // Realtime failed/dropped: fall back to tight polling so the list
              // still updates within a few seconds.
              if (realtimeHealthy) {
                realtimeHealthy = false;
                startPolling(POLL_MS_FALLBACK);
              }
            }
          });
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
      authListener = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
        }
      }).data;
    }

    return () => {
      cancelled = true;
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      authListener?.subscription.unsubscribe();
      if (supabase && registrationChannel) {
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

        // Keep the modal's local copy in sync in case it stays mounted while
        // the closing animation plays out.
        setSelectedReg({ ...selectedReg, status: newStatus });

        // The two action buttons only exist for `confirmed` records, so once the
        // status is changed the phiếu should "move" to its matching tab where it
        // is view/delete only. Close the details modal and switch the active tab
        // (which resets to page 1). Changing `status`/`page` triggers the
        // fetch-on-filter effect, so no manual re-fetch is needed here — calling
        // `fetchRegistrations()` now would run against the stale filter.
        setIsDetailsOpen(false);
        setStatus(newStatus);
        setPage(1);
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

  // Open the delete confirmation dialog for a registration.
  const openDeleteDialog = (reg: RegistrationWithRelations) => {
    setRegToDelete(reg);
    setIsDeleteOpen(true);
  };

  // Confirm & perform the hard delete, then refresh the list in place
  // (preserving the current page, filters and search term).
  const handleDeleteConfirm = async () => {
    if (!regToDelete) return;
    setDeleteLoading(true);
    try {
      const deletedId = regToDelete.id;
      const res = await deleteRegistration(deletedId);
      if (res.success) {
        toast({
          title: 'Thành công',
          description: 'Đã xóa lần gặp khỏi hệ thống.',
          variant: 'default',
        });
        setIsDeleteOpen(false);
        // Close the details modal if it was showing the deleted record.
        if (selectedReg?.id === deletedId) {
          setIsDetailsOpen(false);
        }
        setRegToDelete(null);
        // Optimistically remove the row so the UI updates instantly instead of
        // waiting for the (potentially slow, exact-count) list re-fetch.
        setRegistrations((prev) => prev.filter((r) => r.id !== deletedId));
        setTotalRegs((prev) => Math.max(0, prev - 1));
        // Reconcile pagination / counts in the background.
        fetchRegistrations();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể xóa lần gặp.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể xóa lần gặp.';
      toast({
        title: 'Lỗi hệ thống',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(false);
    }
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

  // Whether the selected registration's assigned time slot has already ended
  // (in VN/+7 time). The "Hoàn thành" / "Vắng mặt" actions are only meaningful
  // once the visit slot is over, so we mirror the server-side guard
  // (`schedulingService.updateRegistrationStatus`) here to enable the buttons
  // and, otherwise, explain why they are unavailable. Re-computed whenever the
  // selected record changes (i.e. when the details modal opens).
  const canUpdateSelectedStatus = React.useMemo(() => {
    if (!selectedReg) return false;
    return hasSlotEndedVN(selectedReg.visit_date, selectedReg.time_slot_end);
  }, [selectedReg]);

  // Date-range filter handlers.
  //
  // "Từ ngày": khi chọn/nhập, tự động gán "Đến ngày" = ngày kế tiếp NẾU "Đến
  // ngày" đang trống hoặc đang nhỏ hơn "Từ ngày" (giữ khoảng hợp lệ). Người
  // dùng vẫn có thể chỉnh lại "Đến ngày" sau đó.
  const handleDateFromChange = React.useCallback(
    (iso: string) => {
      setDateFrom(iso);
      setPage(1);
      if (iso) {
        setDateTo((prevTo) => {
          if (!prevTo || prevTo < iso) {
            return addDaysISO(iso, 1);
          }
          return prevTo;
        });
      }
    },
    [],
  );

  // "Đến ngày": không tự thay đổi "Từ ngày". Không cho chọn nhỏ hơn "Từ ngày";
  // nếu xảy ra (qua nhập tay) thì hiển thị thông báo và KHÔNG áp dụng lọc, giữ
  // nguyên giá trị hợp lệ trước đó.
  const handleDateToChange = React.useCallback(
    (iso: string) => {
      if (iso && dateFrom && iso < dateFrom) {
        toast({
          title: 'Khoảng ngày không hợp lệ',
          description: '“Đến ngày” không được nhỏ hơn “Từ ngày”.',
          variant: 'destructive',
        });
        return;
      }
      setDateTo(iso);
      setPage(1);
    },
    [dateFrom, toast],
  );

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
          <Button
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              const ok = await downloadExport(exportUrl, 'danh-sach-dang-ky.xlsx');
              if (!ok) {
                toast({
                  title: 'Lỗi',
                  description: 'Không thể xuất danh sách. Vui lòng thử lại.',
                  variant: 'destructive',
                });
              }
            }}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting ? 'Đang xuất...' : 'Xuất danh sách Excel'}
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
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          {/* Search bar */}
          <div className="relative flex-1 md:min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <Input
              placeholder="Tìm theo mã lịch hẹn, số giam, tên người bị giam giữ hoặc người thân..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-11 pl-9"
            />
            {/* Subtle inline spinner while a debounced search request is in flight,
                so the admin knows the (delayed) search is working. */}
            {loading && hasLoadedOnce && search !== debouncedSearch && (
              <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-r-transparent" />
            )}
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-3 md:ml-4">
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-caption-sm font-medium text-mute">
                Từ ngày
              </label>
              <DatePicker
                value={dateFrom}
                onChange={handleDateFromChange}
                aria-label="Từ ngày"
                className="w-40"
                inputClassName="h-11 text-caption-md"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-caption-sm font-medium text-mute">
                Đến ngày
              </label>
              <DatePicker
                value={dateTo}
                onChange={handleDateToChange}
                disabledBefore={dateFrom || undefined}
                aria-label="Đến ngày"
                align="end"
                className="w-40"
                inputClassName="h-11 text-caption-md"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Registrations List Table */}
      <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface shadow-sm">
        {/* While a background refetch runs (filter/page change) we keep the old
            rows and just dim + block the table so the content never disappears.
            The initial load is handled by the skeleton below instead. */}
        {showRefetchDim && (
          <div className="pointer-events-none absolute inset-0 z-10 bg-surface/40" aria-hidden="true" />
        )}
        <Table
          aria-busy={loading}
          className={showRefetchDim ? 'opacity-60 transition-opacity' : 'transition-opacity'}
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px] font-semibold">Mã lịch hẹn</TableHead>
              <TableHead className="font-semibold">Thân nhân liên hệ</TableHead>
              <TableHead className="font-semibold">Người bị giam giữ</TableHead>
              <TableHead className="font-semibold">Ngày thăm gặp</TableHead>
              <TableHead className="font-semibold">Ca giờ hẹn</TableHead>
              <TableHead className="font-semibold">Trạng thái</TableHead>
              <TableHead className="w-[110px] text-right font-semibold">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          {loading && !hasLoadedOnce ? (
            <TableSkeleton
              rows={limit}
              columns={[
                { width: 'w-16' },
                { width: 'w-40' },
                { width: 'w-36' },
                { width: 'w-24' },
                { width: 'w-24' },
                { width: 'w-20' },
                { width: 'w-16', align: 'right' },
              ]}
            />
          ) : (
          <TableBody>
            {registrations.length === 0 ? (
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
                      <div className="flex items-center justify-end gap-1">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(reg)}
                          className="h-8 w-8 text-danger hover:bg-danger-soft hover:text-danger"
                          title="Xóa lần gặp"
                          aria-label="Xóa lần gặp"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          )}
        </Table>

        {/* Pagination */}
        {/* Keep pagination visible during background refetches so the page
            controls don't jump; only hide it before the very first load. */}
        {hasLoadedOnce && totalPages > 1 && (
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
                          <TableCell className="py-2 text-caption-md">{formatDateVN(vis.date_of_birth) || '—'}</TableCell>
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
                {selectedReg?.status === 'confirmed' && canUpdateSelectedStatus && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleStatusChange('completed')}
                      disabled={actionLoading}
                      className="bg-success text-on-primary hover:bg-success/90"
                    >
                      {actionLoading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-4 w-4" />
                      )}
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
                      {actionLoading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <UserX className="mr-1 h-4 w-4" />
                      )}
                      Vắng mặt (No-Show)
                    </Button>
                  </>
                )}
                {selectedReg?.status === 'confirmed' && !canUpdateSelectedStatus && (
                  <p className="text-caption-sm text-mute flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Chỉ có thể cập nhật trạng thái sau khi kết thúc thời gian thăm gặp.
                  </p>
                )}
                {selectedReg?.status !== 'confirmed' && (
                  <p className="text-caption-sm text-mute flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Không thể đổi trạng thái của lịch hẹn đã hoàn thành / vắng mặt.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {selectedReg && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteDialog(selectedReg)}
                    className="border-danger/30 text-danger hover:border-danger/50 hover:bg-danger-soft"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Xóa lần gặp
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  Đóng
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={(open) => !deleteLoading && setIsDeleteOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-heading-lg font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-danger" />
              Xác nhận xóa lần gặp
            </DialogTitle>
            <DialogDescription className="text-body-md text-mute">
              Bạn có chắc chắn muốn xóa lịch hẹn thăm gặp này? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          {regToDelete && (
            <div className="my-2 space-y-1 rounded-lg border border-hairline-soft bg-soft-cloud/40 p-3 text-caption-md">
              <p>
                Mã lịch hẹn:{' '}
                <span className="font-mono font-semibold text-ink">
                  {regToDelete.id.substring(0, 8).toUpperCase()}
                </span>
              </p>
              <p>
                Người bị giam giữ:{' '}
                <strong className="text-ink">{toTitleCaseName(regToDelete.inmate?.full_name)}</strong>{' '}
                <span className="font-mono text-mute">({regToDelete.inmate?.prison_number})</span>
              </p>
              <p>
                Ngày thăm: <strong className="text-ink">{formatDateVN(regToDelete.visit_date)}</strong> ·{' '}
                <span className="font-mono">
                  {regToDelete.time_slot_start.substring(0, 5)} - {regToDelete.time_slot_end.substring(0, 5)}
                </span>
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsDeleteOpen(false)}
              disabled={deleteLoading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
              className="bg-danger text-on-primary hover:bg-danger/90"
            >
              {deleteLoading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                  Đang xóa...
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Xóa lần gặp
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
