'use client';

import * as React from 'react';
import { 
  Search, 
  Download, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
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

  React.useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      return undefined;
    }

    const registrationChannel = supabase
      .channel('public:visit_registrations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_registrations' }, (payload) => {
        const record = payload.new as Record<string, unknown>;
        if (record?.id && typeof record.id === 'string') {
          setHighlightedRegistrationId(record.id);
          fetchRegistrations();
          if (highlightTimeoutRef.current) {
            window.clearTimeout(highlightTimeoutRef.current);
          }
          highlightTimeoutRef.current = window.setTimeout(() => {
            setHighlightedRegistrationId(null);
            highlightTimeoutRef.current = null;
          }, 5000);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visit_registrations' }, (payload) => {
        const record = payload.new as Record<string, unknown>;
        if (record?.id && typeof record.id === 'string') {
          fetchRegistrations();
        }
      })
      .subscribe();

    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      supabase.removeChannel(registrationChannel);
    };
  }, [fetchRegistrations, selectedReg]);

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

  // Get status badge styles
  const getStatusBadge = (statusVal: string) => {
    switch (statusVal) {
      case 'confirmed':
        return 'bg-info/10 text-info border-info/20';
      case 'completed':
        return 'bg-success/10 text-success border-success/20';
      case 'no_show':
        return 'bg-sale/10 text-sale border-sale/20';
      default:
        return 'bg-soft-cloud text-mute border-hairline';
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
            Theo dõi, quản lý và cập nhật trạng thái các buổi gặp mặt của thân nhân với phạm nhân ({totalRegs} lịch hẹn).
          </p>
        </div>
        <div>
          <Button 
            variant="outline"
            asChild
            className="rounded-full"
          >
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
                className={`px-4 py-2.5 text-caption-md font-semibold border-b-2 transition-colors -mb-px ${
                  isActive
                    ? 'border-ink text-ink font-bold'
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
              placeholder="Tìm theo số hiệu, tên phạm nhân hoặc người thân..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-11 bg-canvas border border-hairline focus-ring rounded-md"
            />
          </div>

          {/* Date Pickers */}
          <div className="grid grid-cols-2 gap-2 md:col-span-6">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute pointer-events-none" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-11 bg-canvas border border-hairline focus-ring rounded-md text-caption-md"
                placeholder="Từ ngày"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute pointer-events-none" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-11 bg-canvas border border-hairline focus-ring rounded-md text-caption-md"
                placeholder="Đến ngày"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Registrations List Table */}
      <div className="bg-canvas border border-hairline overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px] font-semibold">Mã lịch hẹn</TableHead>
              <TableHead className="font-semibold">Thân nhân liên hệ</TableHead>
              <TableHead className="font-semibold">Phạm nhân thăm gặp</TableHead>
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
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-ink border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                  <p className="mt-2 text-caption-md text-mute">Đang tải danh sách đăng ký...</p>
                </TableCell>
              </TableRow>
            ) : registrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-mute text-body-md">
                  Không tìm thấy lịch hẹn nào phù hợp.
                </TableCell>
              </TableRow>
            ) : (
              registrations.map((reg) => {
                const primaryVisitor = reg.visitors?.find(v => v.display_order === 1)?.full_name || 'N/A';
                const visitorsCount = reg.visitors?.length || 0;
                const visitorLabel = visitorsCount > 1 
                  ? `${primaryVisitor} (+${visitorsCount - 1} người)` 
                  : primaryVisitor;
                const isHighlighted = reg.id === highlightedRegistrationId;

                return (
                  <TableRow 
                    key={reg.id} 
                    className={`hover:bg-soft-cloud/30 cursor-pointer transition-colors duration-200 ${isHighlighted ? 'bg-success/10 ring-2 ring-success/30' : ''}`}
                    onClick={() => openDetailsModal(reg)}
                  >
                    <TableCell className="font-mono text-caption-sm text-mute">
                      {reg.id.substring(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell className="font-semibold text-ink">{visitorLabel}</TableCell>
                    <TableCell>
                      <p className="font-medium text-ink">{reg.inmate?.full_name}</p>
                      <p className="text-caption-sm text-mute font-mono">{reg.inmate?.prison_number}</p>
                    </TableCell>
                    <TableCell className="font-medium">{reg.visit_date}</TableCell>
                    <TableCell className="font-mono text-caption-md">
                      {reg.time_slot_start.substring(0, 5)} - {reg.time_slot_end.substring(0, 5)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption-sm font-semibold border ${getStatusBadge(reg.status)}`}>
                        {getStatusLabel(reg.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDetailsModal(reg)}
                        className="h-8 w-8 rounded-full"
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
          <div className="flex items-center justify-between border-t border-hairline px-6 py-4 bg-canvas">
            <span className="text-caption-md text-mute">
              Hiển thị từ {(page - 1) * limit + 1} đến {Math.min(page * limit, totalRegs)} trong số {totalRegs} lịch hẹn
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                aria-label="Trang trước"
                className="h-9 w-9 rounded-full"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
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
                aria-label="Trang sau"
                className="h-9 w-9 rounded-full"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Registration Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl bg-canvas p-6 border border-hairline-soft rounded-none">
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
                    Hồ sơ phạm nhân
                  </h3>
                  <div className="space-y-1 text-caption-md bg-soft-cloud/40 border border-hairline-soft p-3">
                    <p>Họ tên: <strong className="text-ink">{selectedReg.inmate?.full_name}</strong></p>
                    <p>Số hiệu: <span className="font-mono text-ink font-semibold">{selectedReg.inmate?.prison_number}</span></p>
                  </div>
                </div>

                {/* Column 2: Date & Slot */}
                <div className="space-y-2.5">
                  <h3 className="text-body-strong font-bold text-ink flex items-center gap-2">
                    <Clock className="h-4 w-4 text-mute" />
                    Lịch hẹn thăm gặp
                  </h3>
                  <div className="space-y-1 text-caption-md bg-soft-cloud/40 border border-hairline-soft p-3">
                    <p>Ngày thăm: <strong className="text-ink">{selectedReg.visit_date}</strong></p>
                    <p>Giờ hẹn: <span className="font-semibold text-ink font-mono">{selectedReg.time_slot_start.substring(0, 5)} - {selectedReg.time_slot_end.substring(0, 5)}</span></p>
                    <p className="flex items-center gap-1.5 mt-0.5">Trạng thái: 
                      <span className={`inline-flex items-center px-2 py-0.2 rounded-full text-utility-xs font-semibold border ${getStatusBadge(selectedReg.status)}`}>
                        {getStatusLabel(selectedReg.status)}
                      </span>
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
                        <TableHead className="h-9 py-1 font-semibold">Quan hệ với phạm nhân</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReg.visitors?.sort((a, b) => a.display_order - b.display_order).map((vis, i) => (
                        <TableRow key={vis.id} className="hover:bg-soft-cloud/20">
                          <TableCell className="py-2 text-caption-md font-mono">{i + 1}</TableCell>
                          <TableCell className="py-2 text-caption-md font-semibold text-ink">{vis.full_name}</TableCell>
                          <TableCell className="py-2 text-caption-md">{vis.date_of_birth}</TableCell>
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
                    className="rounded-full h-9 border-hairline-soft hover:bg-soft-cloud"
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
                    className="rounded-full h-9 border-hairline-soft hover:bg-soft-cloud"
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
                      variant="default"
                      size="sm"
                      onClick={() => handleStatusChange('completed')}
                      disabled={actionLoading}
                      className="rounded-full h-9 bg-success hover:bg-success/90 border-transparent text-white"
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
                      className="rounded-full h-9 text-sale hover:bg-sale/5 border-sale/30 hover:border-sale/50"
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
                className="rounded-full h-9"
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
