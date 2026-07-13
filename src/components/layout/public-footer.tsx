export function PublicFooter() {
  return (
    <footer className="bg-canvas border-t border-hairline py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1: Contact Details */}
          <div>
            <h3 className="text-body-strong text-ink font-semibold uppercase tracking-wider mb-4">
              Thông Tin Liên Hệ
            </h3>
            <ul className="space-y-2 text-caption-md text-mute">
              <li>Địa chỉ: Đường số 12, Khu Phố 4, Phường Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh</li>
              <li>Điện thoại hỗ trợ: (028) 3896-1234 (Giờ hành chính)</li>
              <li>Email: hotro.thaingiam@gov.vn</li>
            </ul>
          </div>

          {/* Column 2: Scheduling Rules Reminder */}
          <div>
            <h3 className="text-body-strong text-ink font-semibold uppercase tracking-wider mb-4">
              Lưu Ý Đăng Ký
            </h3>
            <ul className="space-y-2 text-caption-md text-mute">
              <li>• Lịch thăm gặp chỉ được tổ chức vào ngày <strong>Thứ Năm</strong> và <strong>Thứ Sáu</strong> hàng tuần.</li>
              <li>• Thời gian đăng ký tối thiểu phải là trước 01 ngày (ngày đăng ký phải trong tương lai).</li>
              <li>• Mỗi lần đăng ký được đi kèm tối đa 03 thân nhân.</li>
            </ul>
          </div>

          {/* Column 3: Inmate visit limits */}
          <div>
            <h3 className="text-body-strong text-ink font-semibold uppercase tracking-wider mb-4">
              Quy Định Số Lần Thăm
            </h3>
            <ul className="space-y-2 text-caption-md text-mute">
              <li>• Người bị tạm giữ: Tối đa 02 lần/tháng.</li>
              <li>• Người bị tạm giam: Tối đa 01 lần/tháng.</li>
              <li>• Phạm nhân: Tối đa 01 lần/tháng.</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-utility-xs text-mute text-center sm:text-left">
            © 2026 Cổng thông tin điện tử Cơ quan quản lý thi hành án hình sự và hỗ trợ tư pháp. Bảo lưu mọi quyền.
          </p>
          <div className="flex gap-4 text-utility-xs text-mute font-medium">
            <a href="#" className="hover:text-ink transition-colors">Điều khoản sử dụng</a>
            <span>·</span>
            <a href="#" className="hover:text-ink transition-colors">Chính sách bảo mật</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
