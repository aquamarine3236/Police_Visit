'use client';

import { useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, ShieldAlert, CheckCircle2, XCircle, Loader2, CalendarClock, Hash, User, CalendarDays, Clock, Users, Tag } from 'lucide-react';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import {
  publicRegistrationFormSchema,
  type PublicRegistrationFormData,
} from '@/lib/validations/registration';

import { submitRegistration } from '@/actions/registration';
import { formatDateVN, toTitleCaseName } from '@/lib/format';
import {
  todayVN,
  calendarDateToISO,
  getISODayOfWeekVN,
  getWeekdayNameVN,
} from '@/lib/time';

// Default prison ID for single-prison system
const DEFAULT_PRISON_ID = '11111111-1111-1111-1111-111111111111';

interface PublicSettings {
  suitable_days: number[];
  suitable_days_labels: string[];
  notice_message: string;
  visit_time: number;
  morning_start_time: string;
  morning_end_time: string;
  afternoon_start_time: string;
  afternoon_end_time: string;
  max_visit_per_time: number;
}

interface SuccessResult {
  registration: {
    id: string;
    visit_date: string;
    time_slot_start: string;
    time_slot_end: string;
    status: string;
  };
  visitors: {
    full_name: string;
    citizen_id: string;
    relationship: string;
    display_order: number;
  }[];
  inmate: PublicRegistrationFormData['inmate'];
}

interface RegistrationFormProps {
  /**
   * Scheduling settings resolved on the server (cached) and passed in so the
   * form renders instantly — no client-side fetch + spinner on first paint.
   * `null` means the server could not load settings (rare); we surface a
   * friendly error instead of blocking the whole page.
   */
  initialSettings: PublicSettings | null;
}

export default function RegistrationForm({ initialSettings }: RegistrationFormProps) {
  // Seed directly from the server-provided settings — no loading state needed.
  const [publicSettings] = useState<PublicSettings | null>(initialSettings);
  const settingsError = initialSettings
    ? null
    : 'Không thể tải cấu hình lịch thăm gặp.';

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success state
  const [successData, setSuccessData] = useState<SuccessResult | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);

  // Error dialog state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isErrorOpen, setIsErrorOpen] = useState(false);

  const form = useForm<PublicRegistrationFormData>({
    resolver: zodResolver(publicRegistrationFormSchema),
    defaultValues: {
      inmate: {
        prison_number: '',
        full_name: '',
        date_of_birth: '',
        classification: 'Người bị tạm giữ',
      },
      visitors: [
        {
          full_name: '',
          date_of_birth: '',
          citizen_id: '',
          relationship: '',
        },
      ],
      visit_date: '',
    },
  });

  const { control, handleSubmit, register, formState: { errors } } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'visitors',
  });

  // ─── Date disabled logic (uses dynamic suitable_days from settings) ──────
  // Mọi phép tính "hôm nay / thứ trong tuần" đều theo UTC+7 (nghiệp vụ duy nhất),
  // độc lập với timezone của trình duyệt người dùng.
  const isDateDisabled = (date: Date) => {
    // Ngày người dùng nhìn thấy trên lịch, quy về chuỗi ISO `yyyy-mm-dd`.
    const isoDate = calendarDateToISO(date);

    // Phải là ngày trong tương lai theo +7 (không gồm hôm nay).
    if (isoDate <= todayVN()) return true;

    // Phải là ngày thăm gặp hợp lệ (lấy động từ settings).
    if (publicSettings?.suitable_days) {
      const isoDay = getISODayOfWeekVN(isoDate);
      return !publicSettings.suitable_days.includes(isoDay);
    }

    // Fallback: disable all if no settings loaded
    return true;
  };

  const formatDateString = (date: Date) => calendarDateToISO(date);

  const formatDateVietnamese = (dateStr: string) => formatDateVN(dateStr);

  const getDayOfWeekVietnamese = (dateStr: string) => {
    if (!dateStr) return '';
    return getWeekdayNameVN(dateStr);
  };

  const formatTimeSlot = (timeStr: string) => {
    if (!timeStr) return '';
    // time_slot_start could be "08:00:00" or "08:00" — show first 5 chars
    return timeStr.substring(0, 5);
  };

  // ─── Handle form submission (wired to Server Action) ─────────────────────
  const onSubmit = async (data: PublicRegistrationFormData) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await submitRegistration(DEFAULT_PRISON_ID, data);

      if (result.success && result.data) {
        setSuccessData({
          registration: result.data.registration,
          visitors: result.data.visitors,
          inmate: data.inmate,
        });
        setIsSuccessOpen(true);
      } else {
        // Handle server-side validation errors
        if (result.errors) {
          // Map field-level errors back to form
          Object.entries(result.errors).forEach(([key, messages]) => {
            const fieldPath = key as Parameters<typeof form.setError>[0];
            form.setError(fieldPath, {
              type: 'server',
              message: messages[0],
            });
          });
        }
        // Display the general error message in a dialog
        const message = result.message || 'Đã xảy ra lỗi khi đăng ký.';
        setErrorMessage(message);
        setIsErrorOpen(true);
      }
    } catch {
      const message = 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.';
      setErrorMessage(message);
      setIsErrorOpen(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddVisitor = () => {
    if (fields.length >= 3) {
      return;
    }
    append({
      full_name: '',
      date_of_birth: '',
      citizen_id: '',
      relationship: '',
    });
  };

  const handleSuccessClose = () => {
    setIsSuccessOpen(false);
    setSuccessData(null);
    setErrorMessage(null);
    form.reset();
  };

  const handleErrorClose = () => {
    setIsErrorOpen(false);
    setErrorMessage(null);
  };

  return (
    <div className="flex-1 bg-soft-cloud px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-caption-sm font-semibold text-primary-deep">
            <CalendarClock className="h-4 w-4" />
            Dịch vụ công trực tuyến
          </span>
          <h1 className="mt-4 text-heading-xl font-bold tracking-tight text-ink">
            Đăng ký lịch hẹn thăm gặp
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-body-md text-mute">
            Vui lòng điền chính xác thông tin người đang bị quản lý giam giữ và thân nhân đi kèm để hệ thống tự động sắp xếp lịch hẹn.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm sm:p-8 lg:p-10">
          {/* Settings error state (server could not resolve config) */}
          {settingsError && (
            <Alert variant="danger" className="mb-6">
              {settingsError}
            </Alert>
          )}

          {!settingsError && (
            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">

                {/* Section 1: Inmate Information */}
                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-caption-md font-bold text-on-primary">
                      1
                    </span>
                    <div>
                      <h3 className="text-heading-lg font-bold text-ink">Thông tin người đang bị quản lý giam giữ</h3>
                      <p className="mt-0.5 text-caption-md text-mute">
                        Nhập chính xác thông tin người đang bị quản lý giam giữ.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={control}
                      name="inmate.prison_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-body-strong">Số giam <span className="text-sale">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Ví dụ: PMN12345" {...field} className="rounded-md" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="inmate.date_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-body-strong">Ngày sinh</FormLabel>
                          <FormControl>
                            <DateInput
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              className="rounded-md"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="inmate.classification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-body-strong">Phân loại <span className="text-sale">*</span></FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-md">
                                <SelectValue placeholder="Chọn phân loại" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Người bị tạm giữ">Người bị tạm giữ (Tối đa 3 lần)</SelectItem>
                              <SelectItem value="Người bị tạm giam">Người bị tạm giam (1 lần/tháng)</SelectItem>
                              <SelectItem value="Người bị kết án tử hình">Người bị kết án tử hình (1 lần/tháng)</SelectItem>
                              <SelectItem value="Phạm nhân">Phạm nhân (1 lần/tháng)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Section 2: Visitor Details */}
                <div className="space-y-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-caption-md font-bold text-on-primary">
                        2
                      </span>
                      <div>
                        <h3 className="text-heading-lg font-bold text-ink">Danh sách người đi thăm</h3>
                        <p className="mt-0.5 text-caption-md text-mute">
                          Đăng ký tối đa 03 thân nhân đi thăm gặp trong một lượt.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddVisitor}
                      disabled={fields.length >= 3}
                      className="shrink-0 flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Thêm người đi thăm
                    </Button>
                  </div>

                  {errors.visitors?.root && (
                    <div className="p-4 bg-sale-deep/5 border border-sale text-sale text-caption-md flex items-center gap-3">
                      <ShieldAlert className="h-5 w-5 shrink-0" />
                      <span>{errors.visitors.root.message}</span>
                    </div>
                  )}

                  {/* Show array-level message from server (e.g., duplicate CCCD) */}
                  {errors.visitors?.message && (
                    <div className="p-4 bg-sale-deep/5 border border-sale text-sale text-caption-md flex items-center gap-3">
                      <ShieldAlert className="h-5 w-5 shrink-0" />
                      <span>{errors.visitors.message}</span>
                    </div>
                  )}

                  <div className="space-y-8">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="relative space-y-6 rounded-lg border border-hairline bg-canvas p-5 sm:p-6"
                      >
                        <div className="flex items-center justify-between border-b border-hairline-soft pb-3">
                          <span className="inline-flex items-center gap-2 text-body-strong font-bold text-ink">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-soft text-caption-sm font-bold text-gold">
                              {index + 1}
                            </span>
                            Người đi thăm
                          </span>
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              aria-label={`Xóa người đi thăm #${index + 1}`}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-caption-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-ring"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Xóa
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormItem>
                            <FormLabel className="text-body-strong">Họ và tên <span className="text-sale">*</span></FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nhập họ và tên thân nhân"
                                {...register(`visitors.${index}.full_name` as const)}
                                className="rounded-md"
                              />
                            </FormControl>
                            {errors.visitors?.[index]?.full_name && (
                              <p className="text-caption-sm font-medium text-sale">
                                {errors.visitors[index].full_name.message}
                              </p>
                            )}
                          </FormItem>

                          <FormItem>
                            <FormLabel className="text-body-strong">Ngày sinh</FormLabel>
                            <FormControl>
                              <Controller
                                control={control}
                                name={`visitors.${index}.date_of_birth` as const}
                                render={({ field }) => (
                                  <DateInput
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    className="rounded-md"
                                  />
                                )}
                              />
                            </FormControl>
                            {errors.visitors?.[index]?.date_of_birth && (
                              <p className="text-caption-sm font-medium text-sale">
                                {errors.visitors[index].date_of_birth.message}
                              </p>
                            )}
                          </FormItem>

                          <FormItem>
                            <FormLabel className="text-body-strong">Quan hệ với người đang bị quản lý giam giữ <span className="text-sale">*</span></FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ví dụ: Bố, mẹ, vợ, con..."
                                {...register(`visitors.${index}.relationship` as const)}
                                className="rounded-md"
                              />
                            </FormControl>
                            {errors.visitors?.[index]?.relationship && (
                              <p className="text-caption-sm font-medium text-sale">
                                {errors.visitors[index].relationship.message}
                              </p>
                            )}
                          </FormItem>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Visit Date */}
                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-caption-md font-bold text-on-primary">
                      3
                    </span>
                    <div>
                      <h3 className="text-heading-lg font-bold text-ink">Chọn ngày thăm gặp</h3>
                      <p className="mt-0.5 text-caption-md text-mute">
                        Lựa chọn một ngày trong tương lai được phép tổ chức thăm gặp.
                      </p>
                    </div>
                  </div>

                  {/* Dynamic notice from public settings */}
                  <Alert variant="info" title="Thông báo quy định ngày thăm gặp">
                    {publicSettings?.notice_message || 'Đang tải thông tin ngày thăm gặp...'}
                  </Alert>

                  <div className="flex flex-col items-center gap-6">
                    <div className="w-full max-w-sm">
                      <FormField
                        control={control}
                        name="visit_date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel className="text-body-strong text-center md:text-left mb-2">Ngày thăm gặp <span className="text-sale">*</span></FormLabel>
                            <FormControl>
                              <div className="flex flex-col gap-4">
                                <Calendar
                                  mode="single"
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={(date) => {
                                    field.onChange(date ? formatDateString(date) : '');
                                  }}
                                  disabled={isDateDisabled}
                                  startMonth={new Date()}
                                  className="mx-auto w-full max-w-[320px] rounded-lg border border-hairline bg-canvas p-4"
                                />
                                {field.value && (
                                  <p className="text-caption-md text-success font-semibold text-center mt-2 flex items-center justify-center gap-1">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Đã chọn: {getDayOfWeekVietnamese(field.value)}, {formatDateVietnamese(field.value)}
                                  </p>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage className="text-center" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end gap-4 border-t border-hairline pt-8">
                  <Button type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Đang xử lý đăng ký...
                      </>
                    ) : (
                      'Đăng ký lịch hẹn'
                    )}
                  </Button>
                </div>

              </form>
            </Form>
          )}
        </div>
      </div>

      {/* Success Modal with real assigned slot data */}
      <Dialog open={isSuccessOpen} onOpenChange={(open) => { if (!open) handleSuccessClose(); }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex max-h-[90vh] flex-col">
          <DialogHeader className="shrink-0 text-center px-6 pt-8 pb-6 border-b border-hairline bg-gradient-to-b from-success-soft/40 to-transparent">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success ring-8 ring-success-soft/30">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <DialogTitle className="text-center text-heading-lg font-bold tracking-tight text-ink">
              Đăng ký thành công!
            </DialogTitle>
            <DialogDescription className="text-center mt-2 text-mute">
              Hệ thống đã ghi nhận thông tin đăng ký của bạn. Lịch hẹn thăm gặp đã được tự động phê duyệt.
            </DialogDescription>
          </DialogHeader>

          {successData && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
              {/* Booking code — the hero of the receipt */}
              <div className="flex items-center justify-between rounded-lg border border-hairline bg-soft-cloud px-4 py-3">
                <div className="flex items-center gap-2 text-caption-md text-mute">
                  <Hash className="h-4 w-4 text-primary" />
                  <span className="font-medium">Mã lịch hẹn</span>
                </div>
                <span className="font-mono text-heading-sm font-bold tracking-widest text-ink">
                  {successData.registration.id.substring(0, 8).toUpperCase()}
                </span>
              </div>

              {/* Time slot — highlighted */}
              <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-soft/40 px-4 py-3">
                <div className="flex items-center gap-2 text-caption-md text-success">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Khung giờ hẹn</span>
                </div>
                <span className="font-mono text-heading-sm font-bold text-success">
                  {formatTimeSlot(successData.registration.time_slot_start)} – {formatTimeSlot(successData.registration.time_slot_end)}
                </span>
              </div>

              {/* Details grid */}
              <dl className="space-y-3 text-caption-md">
                   <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                  <div className="flex-1">
                    <dt className="text-mute">Người đang bị quản lý giam giữ</dt>
                    <dd className="font-semibold text-ink">
                      <span className="font-mono">Số giam: {successData.inmate.prison_number}</span>
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                  <div className="flex-1">
                    <dt className="text-mute">Phân loại</dt>
                    <dd className="font-semibold text-ink">{successData.inmate.classification}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                  <div className="flex-1">
                    <dt className="text-mute">Ngày thăm gặp</dt>
                    <dd className="font-semibold text-ink">
                      {getDayOfWeekVietnamese(successData.registration.visit_date)}, {formatDateVietnamese(successData.registration.visit_date)}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                  <div className="flex-1">
                    <dt className="text-mute">Người đi thăm đi kèm</dt>
                    <dd>
                      <ul className="mt-1 space-y-1.5">
                        {successData.visitors
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((v, i) => (
                            <li key={i} className="rounded-md bg-soft-cloud px-3 py-2 text-charcoal">
                              <span className="font-semibold text-ink">{toTitleCaseName(v.full_name)}</span>
                              <span className="text-mute"> · {v.relationship}</span>
                            </li>
                          ))}
                      </ul>
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          )}

          <div className="shrink-0 border-t border-hairline bg-surface px-6 py-4">
            <Button onClick={handleSuccessClose} className="w-full">
              Hoàn tất đăng ký
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Modal — mirrors the success dialog layout with an error state */}
      <Dialog open={isErrorOpen} onOpenChange={(open) => { if (!open) handleErrorClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
              <XCircle className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-heading-lg font-bold tracking-tight text-ink">
              Đăng ký không thành công
            </DialogTitle>
            <DialogDescription className="text-center mt-2 text-mute">
              Hệ thống chưa thể ghi nhận đăng ký của bạn. Vui lòng kiểm tra lại thông tin và thử lại.
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div className="mt-6 flex items-start gap-3 border border-danger/30 bg-danger-soft/40 p-4 text-caption-md text-charcoal">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <span className="text-danger-deep">{errorMessage}</span>
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <Button variant="outline" onClick={handleErrorClose} className="w-full sm:w-auto">
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
