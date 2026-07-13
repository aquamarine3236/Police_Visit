'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Calendar, Clock, AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { schedulingSettingsSchema, type SchedulingSettingsFormData } from '@/lib/validations/settings';
import { getCurrentAdminSettings, updateSchedulingSettings } from '@/actions/settings';
const DAY_LABELS: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ Nhật',
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SchedulingSettingsFormData>({
    resolver: zodResolver(schedulingSettingsSchema),
    defaultValues: {
      visit_time: 30,
      morning_start_time: '08:00',
      morning_end_time: '11:30',
      afternoon_start_time: '13:30',
      afternoon_end_time: '16:30',
      max_visit_per_time: 3,
      suitable_days: [4, 5],
    },
  });

  // Watch fields for live calculation
  const watchVisitTime = watch('visit_time');
  const watchMorningStart = watch('morning_start_time');
  const watchMorningEnd = watch('morning_end_time');
  const watchAfternoonStart = watch('afternoon_start_time');
  const watchAfternoonEnd = watch('afternoon_end_time');
  const watchMaxVisit = watch('max_visit_per_time');
  const watchSuitableDays = watch('suitable_days') || [];

  // Fetch current settings on mount
  React.useEffect(() => {
    async function loadSettings() {
      try {
        const res = await getCurrentAdminSettings();
        if (res.success && res.data) {
          reset({
            visit_time: res.data.visit_time,
            morning_start_time: res.data.morning_start_time,
            morning_end_time: res.data.morning_end_time,
            afternoon_start_time: res.data.afternoon_start_time,
            afternoon_end_time: res.data.afternoon_end_time,
            max_visit_per_time: res.data.max_visit_per_time,
            suitable_days: res.data.suitable_days,
          });
        } else {
          // If no settings exist yet, keep default values
          if (res.message && !res.message.includes('Chưa có cấu hình')) {
            toast({
              title: 'Thông báo',
              description: res.message,
              variant: 'destructive',
            });
          }
        }
      } catch {
        toast({
          title: 'Lỗi',
          description: 'Không thể tải cấu hình hiện tại.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [reset, toast]);

  // Handle day toggles
  const handleDayToggle = (day: number) => {
    const current = [...watchSuitableDays];
    const index = current.indexOf(day);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(day);
    }
    setValue('suitable_days', current.sort(), { shouldValidate: true });
  };

  // Slot Calculation Helper
  const slotsPreview = React.useMemo(() => {
    const getMinutes = (timeStr: string) => {
      if (!timeStr || !timeStr.includes(':')) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const formatTime = (totalMin: number) => {
      const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const m = (totalMin % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    const visitTime = Number(watchVisitTime) || 0;
    const maxVisit = Number(watchMaxVisit) || 0;

    if (visitTime <= 0) return { morning: [], afternoon: [], total: 0, capacity: 0 };

    // Calculate morning slots
    const mStart = getMinutes(watchMorningStart);
    const mEnd = getMinutes(watchMorningEnd);
    const morningSlots: string[] = [];
    
    if (mStart < mEnd) {
      let current = mStart;
      while (current + visitTime <= mEnd) {
        morningSlots.push(`${formatTime(current)} - ${formatTime(current + visitTime)}`);
        current += visitTime;
      }
    }

    // Calculate afternoon slots
    const aStart = getMinutes(watchAfternoonStart);
    const aEnd = getMinutes(watchAfternoonEnd);
    const afternoonSlots: string[] = [];

    if (aStart < aEnd) {
      let current = aStart;
      while (current + visitTime <= aEnd) {
        afternoonSlots.push(`${formatTime(current)} - ${formatTime(current + visitTime)}`);
        current += visitTime;
      }
    }

    const total = morningSlots.length + afternoonSlots.length;
    const capacity = total * maxVisit;

    return {
      morning: morningSlots,
      afternoon: afternoonSlots,
      total,
      capacity,
    };
  }, [watchVisitTime, watchMorningStart, watchMorningEnd, watchAfternoonStart, watchAfternoonEnd, watchMaxVisit]);

  const onSubmit = async (data: SchedulingSettingsFormData) => {
    setSaving(true);
    try {
      const res = await updateSchedulingSettings(data);
      if (res.success) {
        toast({
          title: 'Thành công',
          description: 'Cấu hình lịch thăm gặp đã được lưu.',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể lưu cấu hình.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi kết nối khi gửi dữ liệu.';
      toast({
        title: 'Lỗi',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
        <p className="text-caption-md text-mute">Đang tải cấu hình lịch thăm gặp...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-heading-xl font-bold tracking-tight text-ink">Cấu hình lịch thăm gặp</h1>
        <p className="text-caption-md text-mute">
          Thiết lập các khung giờ mở cửa, số lượt tiếp đón tối đa trên mỗi ca, và các ngày làm việc trong tuần.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Settings Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-lg border border-hairline bg-surface p-6 shadow-sm lg:col-span-7">
          {/* Days selector */}
          <div className="space-y-3">
            <div>
              <Label className="text-body-strong font-semibold text-ink">Các ngày cho phép đăng ký thăm gặp *</Label>
              <p className="text-caption-sm text-mute">Chọn ít nhất một ngày làm việc trong tuần.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const label = DAY_LABELS[day];
                const isSelected = watchSuitableDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayToggle(day)}
                    className={`rounded-md border px-4 py-2 text-caption-md font-medium transition-colors focus-ring ${
                      isSelected
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-hairline bg-canvas text-charcoal hover:border-stone hover:bg-soft-cloud'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.suitable_days && (
              <p className="text-caption-sm text-sale flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {errors.suitable_days.message}
              </p>
            )}
          </div>

          {/* Time intervals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-hairline-soft pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="visit_time">Thời gian mỗi ca thăm gặp (phút) *</Label>
              <Input
                id="visit_time"
                type="number"
                min={10}
                max={120}
                {...register('visit_time', { valueAsNumber: true })}
                className={errors.visit_time ? 'border-sale' : ''}
              />
              {errors.visit_time && (
                <p className="text-caption-sm text-sale">{errors.visit_time.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_visit_per_time">Số lượt đăng ký tối đa mỗi ca *</Label>
              <Input
                id="max_visit_per_time"
                type="number"
                min={1}
                max={10}
                {...register('max_visit_per_time', { valueAsNumber: true })}
                className={errors.max_visit_per_time ? 'border-sale' : ''}
              />
              {errors.max_visit_per_time && (
                <p className="text-caption-sm text-sale">{errors.max_visit_per_time.message}</p>
              )}
            </div>
          </div>

          {/* Morning Range */}
          <div className="space-y-3 border-t border-hairline-soft pt-6">
            <h3 className="text-body-strong font-semibold text-ink flex items-center gap-2">
              <Clock className="h-4 w-4 text-mute" />
              Khung giờ làm việc buổi sáng
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="morning_start_time">Giờ bắt đầu *</Label>
                <Input
                  id="morning_start_time"
                  type="time"
                  {...register('morning_start_time')}
                  className={errors.morning_start_time ? 'border-sale' : ''}
                />
                {errors.morning_start_time && (
                  <p className="text-caption-sm text-sale">{errors.morning_start_time.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="morning_end_time">Giờ kết thúc *</Label>
                <Input
                  id="morning_end_time"
                  type="time"
                  {...register('morning_end_time')}
                  className={errors.morning_end_time ? 'border-sale' : ''}
                />
                {errors.morning_end_time && (
                  <p className="text-caption-sm text-sale">{errors.morning_end_time.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Afternoon Range */}
          <div className="space-y-3 border-t border-hairline-soft pt-6">
            <h3 className="text-body-strong font-semibold text-ink flex items-center gap-2">
              <Clock className="h-4 w-4 text-mute" />
              Khung giờ làm việc buổi chiều
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="afternoon_start_time">Giờ bắt đầu *</Label>
                <Input
                  id="afternoon_start_time"
                  type="time"
                  {...register('afternoon_start_time')}
                  className={errors.afternoon_start_time ? 'border-sale' : ''}
                />
                {errors.afternoon_start_time && (
                  <p className="text-caption-sm text-sale">{errors.afternoon_start_time.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="afternoon_end_time">Giờ kết thúc *</Label>
                <Input
                  id="afternoon_end_time"
                  type="time"
                  {...register('afternoon_end_time')}
                  className={errors.afternoon_end_time ? 'border-sale' : ''}
                />
                {errors.afternoon_end_time && (
                  <p className="text-caption-sm text-sale">{errors.afternoon_end_time.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-hairline-soft pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Lưu cấu hình
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Live Preview Panel */}
        <div className="space-y-6 lg:col-span-5">
          <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-sm lg:sticky lg:top-24">
            <h3 className="flex items-center gap-2 text-body-strong font-bold text-ink">
              <Calendar className="h-5 w-5 text-primary" />
              Xem trước ca thăm gặp
            </h3>
            <p className="text-caption-md text-charcoal">
              Số liệu dưới đây được ước tính theo thời gian thực dựa trên các thông số cấu hình bạn đang nhập.
            </p>

            <div className="grid grid-cols-2 gap-4 border-y border-hairline py-4">
              <div className="space-y-0.5">
                <p className="text-caption-sm text-mute uppercase tracking-wider font-semibold">Tổng số ca / ngày</p>
                <p className="text-heading-lg font-black text-ink">{slotsPreview.total} ca</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-caption-sm text-mute uppercase tracking-wider font-semibold">Lượt tiếp đón tối đa</p>
                <p className="text-heading-lg font-black text-ink">{slotsPreview.capacity} lượt/ngày</p>
              </div>
            </div>

            {/* List of slots */}
            <div className="space-y-3">
              <div>
                <p className="text-caption-md font-bold text-ink">Danh sách ca buổi sáng ({slotsPreview.morning.length})</p>
                {slotsPreview.morning.length === 0 ? (
                  <p className="text-caption-sm text-mute italic mt-1">Không có ca nào được tạo ra.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {slotsPreview.morning.map((slot, idx) => (
                      <span key={idx} className="bg-canvas border border-hairline-soft text-caption-sm font-semibold text-charcoal px-2.5 py-1 rounded-md font-mono">
                        {slot}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-hairline-soft">
                <p className="text-caption-md font-bold text-ink">Danh sách ca buổi chiều ({slotsPreview.afternoon.length})</p>
                {slotsPreview.afternoon.length === 0 ? (
                  <p className="text-caption-sm text-mute italic mt-1">Không có ca nào được tạo ra.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {slotsPreview.afternoon.map((slot, idx) => (
                      <span key={idx} className="bg-canvas border border-hairline-soft text-caption-sm font-semibold text-charcoal px-2.5 py-1 rounded-md font-mono">
                        {slot}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
