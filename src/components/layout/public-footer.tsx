import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { PoliceLogo } from '@/components/shared/police-logo';

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-hairline bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-12">
          {/* Brand + contact */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <PoliceLogo size={40} />
              <div>
                <p className="text-caption-md font-bold uppercase tracking-wide text-primary">
                  Bộ Công an
                </p>
                <p className="text-utility-xs text-mute">
                  Quản lý thi hành án hình sự
                </p>
              </div>
            </div>
            <ul className="space-y-2.5 text-caption-md text-mute">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Đường số 12, Khu Phố 4, Phường Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span>(028) 3896-1234 (Giờ hành chính)</span>
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
                  Lịch thăm gặp tổ chức vào <strong className="text-ink">Thứ Năm</strong> và{' '}
                  <strong className="text-ink">Thứ Sáu</strong> hàng tuần.
                </span>
              </li>
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
                <span className="font-semibold text-ink">02 lần/tháng</span>
              </li>
              <li className="flex items-center justify-between border-b border-hairline-soft pb-2">
                <span>Người bị tạm giam</span>
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
              Điều khoản sử dụng
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
