import { Clock, Mail, MapPin, Phone } from 'lucide-react';

interface PublicFooterProps {
  /** Labels of the days visits are allowed on (e.g. ["Thứ Năm", "Thứ Sáu"]). */
  suitableDaysLabels?: string[];
  morningStartTime?: string;
  morningEndTime?: string;
  afternoonStartTime?: string;
  afternoonEndTime?: string;
  /** Minutes per visit slot. */
  visitTime?: number;
  /** Max registrations accepted per slot. */
  maxVisitPerTime?: number;
}

/** Trim seconds off a "HH:mm[:ss]" time string for display. */
function toHM(time?: string): string {
  if (!time) return '';
  return time.substring(0, 5);
}

export function PublicFooter({
  suitableDaysLabels = [],
  morningStartTime,
  morningEndTime,
  afternoonStartTime,
  afternoonEndTime,
  visitTime,
  maxVisitPerTime,
}: PublicFooterProps) {
  const hasDays = suitableDaysLabels.length > 0;
  const hasMorning = Boolean(morningStartTime && morningEndTime);
  const hasAfternoon = Boolean(afternoonStartTime && afternoonEndTime);

  return (
    <footer className="mt-auto border-t border-hairline bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-12">
          {/* Contact */}
          <div>
            <h3 className="mb-4 text-body-strong font-semibold uppercase tracking-wide text-ink">
              Thông tin liên hệ
            </h3>
            <ul className="space-y-2.5 text-caption-md text-mute">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  TDP Tân Vĩnh, Phường Nam Đông Hà, tỉnh Quảng Trị
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span>(Giờ hành chính)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <span>hotro.thamgap@gov.vn</span>
              </li>
            </ul>
          </div>

          {/* Scheduling rules */}
          <div>
            <h3 className="mb-4 text-body-strong font-semibold uppercase tracking-wide text-ink">
              Lưu ý đăng ký
            </h3>
            <ul className="space-y-2.5 text-caption-md text-mute">
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>
                  {hasDays ? (
                    <>
                      Lịch thăm gặp tổ chức vào{' '}
                      {suitableDaysLabels.map((label, i) => (
                        <span key={label}>
                          {i > 0 && (i === suitableDaysLabels.length - 1 ? ' và ' : ', ')}
                          <strong className="text-ink">{label}</strong>
                        </span>
                      ))}{' '}
                      hàng tuần.
                    </>
                  ) : (
                    'Lịch thăm gặp sẽ được thông báo theo cấu hình của cơ quan.'
                  )}
                </span>
              </li>
              {(hasMorning || hasAfternoon) && (
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>
                    Giờ làm việc:
                    {hasMorning && (
                      <> sáng <strong className="text-ink">{toHM(morningStartTime)}–{toHM(morningEndTime)}</strong></>
                    )}
                    {hasMorning && hasAfternoon && ','}
                    {hasAfternoon && (
                      <> chiều <strong className="text-ink">{toHM(afternoonStartTime)}–{toHM(afternoonEndTime)}</strong></>
                    )}
                    .
                  </span>
                </li>
              )}
              {typeof visitTime === 'number' && (
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>
                    Mỗi ca thăm gặp kéo dài <strong className="text-ink">{visitTime} phút</strong>
                    {typeof maxVisitPerTime === 'number' && (
                      <>, tiếp nhận tối đa <strong className="text-ink">{maxVisitPerTime} lượt/ca</strong></>
                    )}
                    .
                  </span>
                </li>
              )}
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>Đăng ký tối thiểu trước 01 ngày (ngày thăm phải trong tương lai).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>Mỗi lần đăng ký đi kèm tối đa 03 thân nhân.</span>
              </li>
            </ul>
          </div>

          {/* Visit limits */}
          <div>
            <h3 className="mb-4 text-body-strong font-semibold uppercase tracking-wide text-ink">
              Quy định số lần thăm
            </h3>
            <ul className="space-y-2.5 text-caption-md text-mute">
              <li className="flex items-center justify-between border-b border-hairline-soft pb-2">
                <span>Người bị tạm giữ</span>
                <span className="font-semibold text-ink">02 lần</span>
              </li>
              <li className="flex items-center justify-between border-b border-hairline-soft pb-2">
                <span>Người bị tạm giam</span>
                <span className="font-semibold text-ink">01 lần/tháng</span>
              </li>
              <li className="flex items-center justify-between border-b border-hairline-soft pb-2">
                <span>Người bị kết án tử hình</span>
                <span className="font-semibold text-ink">01 lần/tháng</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Phạm nhân</span>
                <span className="font-semibold text-ink">01 lần/tháng</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-hairline pt-6 sm:flex-row">
          <p className="text-center text-utility-xs text-mute sm:text-left">
            © 2026 Cổng thông tin điện tử Cơ quan quản lý thi hành án hình sự và hỗ trợ tư pháp. Bảo lưu mọi quyền.
          </p>
          <div className="flex gap-4 text-utility-xs font-medium text-mute">
            <a href="#" className="transition-colors hover:text-primary">
              Hướng dẫn sử dụng
            </a>
            <span className="text-stone">·</span>
            <a href="#" className="transition-colors hover:text-primary">
              Chính sách bảo mật
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
