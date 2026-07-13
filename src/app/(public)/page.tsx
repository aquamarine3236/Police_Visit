'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, ShieldAlert, CheckCircle2 } from 'lucide-react';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  registrationFormSchema,
  type RegistrationFormData,
} from '@/lib/validations/registration';

export default function PublicRegistrationPage() {
  const [successData, setSuccessData] = useState<RegistrationFormData | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationFormSchema),
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

  // Check if dates are Thursday (4) or Friday (5) and in the future
  const isDateDisabled = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date < tomorrow) return true;

    // Allowed days: Thursday (4) and Friday (5)
    const day = date.getDay();
    return day !== 4 && day !== 5;
  };

  const formatDateString = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDateVietnamese = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `Ngày ${parts[2]} tháng ${parts[1]} năm ${parts[0]}`;
  };

  const getDayOfWeekVietnamese = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return days[d.getDay()];
  };

  const onSubmit = (data: RegistrationFormData) => {
    setSuccessData(data);
    setIsSuccessOpen(true);
  };

  const handleAddVisitor = () => {
    if (fields.length >= 3) {
      alert('Chỉ được phép tối đa 3 người đi thăm trong một lần đăng ký.');
      return;
    }
    append({
      full_name: '',
      date_of_birth: '',
      citizen_id: '',
      relationship: '',
    });
  };


  return (
    <div className="bg-soft-cloud flex-1 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-canvas border border-hairline p-8 sm:p-12 rounded-none shadow-sm">
          
          {/* Form Header */}
          <div className="border-b border-hairline pb-6 mb-8">
            <h2 className="text-heading-xl text-ink font-bold tracking-tight text-center">
              ĐĂNG KÝ LỊCH HẸN THĂM GẶP
            </h2>
            <p className="text-body-md text-mute text-center mt-2">
              Vui lòng điền chính xác thông tin phạm nhân và thân nhân đi kèm.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
              
              {/* Section 1: Inmate Information */}
              <div className="space-y-6">
                <div className="border-l-4 border-ink pl-4 py-1">
                  <h3 className="text-heading-lg text-ink font-bold uppercase">
                    1. Thông tin phạm nhân
                  </h3>
                  <p className="text-caption-md text-mute mt-1">
                    Nhập chính xác thông tin người đang bị tạm giữ, tạm giam hoặc phạm nhân.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={control}
                    name="inmate.prison_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-body-strong">Số hiệu phạm nhân <span className="text-sale">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Ví dụ: PMN12345" {...field} className="rounded-md" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="inmate.full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-body-strong">Họ và tên phạm nhân <span className="text-sale">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="NHẬP CHỮ IN HOA CÓ DẤU" {...field} className="rounded-md" />
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
                        <FormLabel className="text-body-strong">Ngày sinh phạm nhân <span className="text-sale">*</span></FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="rounded-md" />
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
                            <SelectItem value="Người bị tạm giữ">Người bị tạm giữ (Tối đa 2 lần/tháng)</SelectItem>
                            <SelectItem value="Người bị tạm giam">Người bị tạm giam (Tối đa 1 lần/tháng)</SelectItem>
                            <SelectItem value="Phạm nhân">Phạm nhân (Tối đa 1 lần/tháng)</SelectItem>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-ink pl-4 py-1">
                  <div>
                    <h3 className="text-heading-lg text-ink font-bold uppercase">
                      2. Danh sách người đi thăm
                    </h3>
                    <p className="text-caption-md text-mute mt-1">
                      Đăng ký tối đa 03 thân nhân đi thăm gặp trong một lượt.
                    </p>
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

                <div className="space-y-8">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="border border-hairline p-6 relative bg-canvas rounded-none space-y-6"
                    >
                      <div className="flex items-center justify-between border-b border-hairline pb-3">
                        <span className="text-body-strong text-ink font-bold">
                          Người đi thăm #{index + 1}
                        </span>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="text-sale hover:text-sale-deep flex items-center gap-1 text-caption-sm font-semibold transition-colors focus-ring"
                          >
                            <Trash2 className="h-4 w-4" />
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
                          <FormLabel className="text-body-strong">Ngày sinh <span className="text-sale">*</span></FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...register(`visitors.${index}.date_of_birth` as const)}
                              className="rounded-md"
                            />
                          </FormControl>
                          {errors.visitors?.[index]?.date_of_birth && (
                            <p className="text-caption-sm font-medium text-sale">
                              {errors.visitors[index].date_of_birth.message}
                            </p>
                          )}
                        </FormItem>

                        <FormItem>
                          <FormLabel className="text-body-strong">Số định danh / CCCD <span className="text-sale">*</span></FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Gồm 12 chữ số"
                              maxLength={12}
                              {...register(`visitors.${index}.citizen_id` as const)}
                              className="rounded-md"
                            />
                          </FormControl>
                          {errors.visitors?.[index]?.citizen_id && (
                            <p className="text-caption-sm font-medium text-sale">
                              {errors.visitors[index].citizen_id.message}
                            </p>
                          )}
                        </FormItem>

                        <FormItem>
                          <FormLabel className="text-body-strong">Quan hệ với phạm nhân <span className="text-sale">*</span></FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ví dụ: Cha, mẹ, vợ, con..."
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
                <div className="border-l-4 border-ink pl-4 py-1">
                  <h3 className="text-heading-lg text-ink font-bold uppercase">
                    3. Chọn ngày thăm gặp
                  </h3>
                  <p className="text-caption-md text-mute mt-1">
                    Lựa chọn một ngày trong tương lai được phép tổ chức thăm gặp.
                  </p>
                </div>

                <div className="p-4 bg-soft-cloud border-l-4 border-ink text-body-md text-charcoal flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-ink shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-ink">Thông báo quy định ngày thăm gặp:</p>
                    <p className="mt-1">Lưu ý: Người dân chỉ có thể đăng ký thăm gặp vào <strong>Thứ Năm</strong> và <strong>Thứ Sáu</strong>.</p>
                  </div>
                </div>

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
                                className="border border-hairline bg-canvas p-4 rounded-none mx-auto w-full max-w-[320px]"
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
              <div className="border-t border-hairline pt-8 flex justify-end gap-4">
                <Button
                  type="submit"
                  className="rounded-full px-8 py-3 bg-ink text-on-primary hover:bg-ink/90 font-bold"
                >
                  Đăng ký lịch hẹn
                </Button>
              </div>

            </form>
          </Form>
        </div>
      </div>

      {/* Success Modal Dialogue (Phase 25 static confirmation) */}
      <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
        <DialogContent className="max-w-md rounded-none border border-hairline p-6">
          <DialogHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-success flex items-center justify-center text-on-primary mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogTitle className="text-heading-xl font-bold uppercase tracking-tight text-ink text-center">
              Đăng Ký Thành Công!
            </DialogTitle>
            <DialogDescription className="text-center mt-2 text-mute">
              Hệ thống đã ghi nhận thông tin đăng ký của bạn. Lịch hẹn thăm gặp đã được tự động phê duyệt.
            </DialogDescription>
          </DialogHeader>

          {successData && (
            <div className="mt-6 border border-hairline-soft bg-soft-cloud p-4 space-y-3 text-caption-md text-charcoal">
              <div className="flex justify-between border-b border-hairline pb-2">
                <span className="font-semibold text-ink">Phạm nhân:</span>
                <span>{successData.inmate.full_name} ({successData.inmate.prison_number})</span>
              </div>
              <div className="flex justify-between border-b border-hairline pb-2">
                <span className="font-semibold text-ink">Phân loại:</span>
                <span>{successData.inmate.classification}</span>
              </div>
              <div className="flex justify-between border-b border-hairline pb-2">
                <span className="font-semibold text-ink">Ngày thăm gặp:</span>
                <span>{getDayOfWeekVietnamese(successData.visit_date)}, {formatDateVietnamese(successData.visit_date)}</span>
              </div>
              <div className="flex justify-between border-b border-hairline pb-2">
                <span className="font-semibold text-ink">Khung giờ dự kiến:</span>
                <span className="font-semibold text-success">08:00 - 08:30 (Mặc định)</span>
              </div>
              <div className="space-y-1">
                <span className="font-semibold text-ink">Người đi thăm đi kèm:</span>
                <ul className="list-disc pl-5 space-y-0.5 text-mute">
                  {successData.visitors.map((v, i) => (
                    <li key={i}>
                      {v.full_name} ({v.relationship}) - CCCD: {v.citizen_id}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => {
                setIsSuccessOpen(false);
                form.reset();
              }}
              className="rounded-full px-8 py-2 bg-ink text-on-primary hover:bg-ink/90 font-semibold"
            >
              Hoàn tất đăng ký
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
