'use client';

import { useState } from 'react';
import { Mail, Lock, Loader2, ShieldAlert, LogIn } from 'lucide-react';
import { login } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PoliceLogo } from '@/components/shared/police-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Client-side basic validation
    if (!email.trim()) {
      setError('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('email', email.trim());
      formData.append('password', password);

      const result = await login(formData);

      // If login returns a result (instead of redirecting), it's an error
      if (result && !result.success) {
        setError(result.message || 'Đăng nhập không thành công.');
      }
    } catch {
      // login() calls redirect() on success which throws a NEXT_REDIRECT error
      // This is expected behavior — the redirect will happen automatically
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-soft-cloud px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo / Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-hairline bg-surface shadow-sm">
            <PoliceLogo size={52} priority />
          </div>
          <h1 className="text-heading-xl font-bold tracking-tight text-ink">
            Đăng nhập quản trị
          </h1>
          <p className="mt-2 text-body-md text-mute">
            Hệ thống Quản lý Đăng ký Thăm gặp
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-hairline bg-surface p-6 shadow-md sm:p-8">
          {/* Error Banner */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4 text-caption-md text-danger animate-fade-in">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Đăng nhập thất bại</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-body-strong font-semibold">
                Địa chỉ Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
                <Input
                  id="login-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="email"
                  autoFocus
                  className="pl-10 h-12 bg-canvas border border-hairline focus-ring rounded-md"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-body-strong font-semibold">
                Mật khẩu
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  className="pl-10 h-12 bg-canvas border border-hairline focus-ring rounded-md"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Đăng nhập
                </>
              )}
            </Button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-hairline">
            <p className="text-center text-caption-sm text-mute">
              Chỉ quản trị viên được cấp quyền mới có thể đăng nhập vào hệ thống.
            </p>
          </div>
        </div>

        {/* Bottom attribution */}
        <p className="text-center text-utility-xs text-mute mt-6">
          © {new Date().getFullYear()} Hệ thống Quản lý Đăng ký Thăm gặp Trực tuyến
        </p>
      </div>
    </div>
  );
}
