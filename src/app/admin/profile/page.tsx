'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building2,
  KeyRound,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  changePasswordSchema,
  displayNameSchema,
  type ChangePasswordFormData,
  type DisplayNameFormData,
} from '@/lib/validations/profile';
import {
  changePassword,
  getSelfProfile,
  switchPrison,
  updateDisplayName,
  type SelfProfile,
} from '@/actions/profile';
import { ProfileSkeleton } from './profile-skeleton';

export default function ProfilePage() {
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<SelfProfile | null>(null);

  const [savingName, setSavingName] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const [selectedPrisonId, setSelectedPrisonId] = React.useState<string>('');

  // ── Display name form ──────────────────────────────────────────────────────
  const nameForm = useForm<DisplayNameFormData>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { full_name: '' },
  });

  // ── Password form ──────────────────────────────────────────────────────────
  const passwordForm = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const loadProfile = React.useCallback(async () => {
    const res = await getSelfProfile();
    if (res.success && res.data) {
      setProfile(res.data);
      nameForm.reset({ full_name: res.data.full_name });
      setSelectedPrisonId(res.data.active_prison?.id ?? '');
    } else {
      toast({
        title: 'Lỗi',
        description: res.message || 'Không thể tải hồ sơ.',
        variant: 'destructive',
      });
    }
    setLoading(false);
  }, [nameForm, toast]);

  React.useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const onSaveName = async (data: DisplayNameFormData) => {
    setSavingName(true);
    try {
      const res = await updateDisplayName(data);
      if (res.success) {
        toast({ title: 'Thành công', description: res.message });
        setProfile((prev) => (prev ? { ...prev, full_name: data.full_name } : prev));
        router.refresh();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể cập nhật tên hiển thị.',
          variant: 'destructive',
        });
      }
    } finally {
      setSavingName(false);
    }
  };

  const onSavePassword = async (data: ChangePasswordFormData) => {
    setSavingPassword(true);
    try {
      const res = await changePassword(data);
      if (res.success) {
        toast({ title: 'Thành công', description: res.message });
        passwordForm.reset();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể đổi mật khẩu.',
          variant: 'destructive',
        });
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const onSwitchPrison = async () => {
    if (!selectedPrisonId || selectedPrisonId === profile?.active_prison?.id) {
      return;
    }
    setSwitching(true);
    try {
      const res = await switchPrison({ prison_id: selectedPrisonId });
      if (res.success) {
        // Refresh the browser session so the realtime socket picks up the new
        // JWT `prison_id` claim, then reload server components.
        const supabase = createBrowserClient();
        if (supabase) {
          await supabase.auth.refreshSession();
        }
        toast({ title: 'Thành công', description: res.message });
        await loadProfile();
        router.refresh();
      } else {
        toast({
          title: 'Thất bại',
          description: res.message || 'Không thể chuyển trại giam.',
          variant: 'destructive',
        });
        setSelectedPrisonId(profile?.active_prison?.id ?? '');
      }
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="rounded-lg border border-hairline bg-surface p-8 text-center text-body-md text-mute">
        Không thể tải hồ sơ quản trị. Vui lòng thử lại.
      </div>
    );
  }

  const isSuperAdmin = profile.role === 'super_admin';
  const nameErrors = nameForm.formState.errors;
  const pwErrors = passwordForm.formState.errors;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-heading-xl font-bold tracking-tight text-ink">
          Cài đặt tài khoản
        </h1>
        <p className="text-caption-md text-mute">
          Quản lý tên hiển thị, mật khẩu và trại giam đang làm việc.
        </p>
      </div>

      {/* Account summary */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-hairline bg-surface p-5 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <User className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-body-strong font-semibold text-ink">
            {profile.full_name}
          </p>
          <p className="truncate text-caption-md text-mute">{profile.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-full bg-soft-cloud px-3 py-1.5 text-caption-sm font-medium text-charcoal">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {isSuperAdmin ? 'Quản trị viên cấp cao' : 'Quản trị viên'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Display name ── */}
        <form
          onSubmit={nameForm.handleSubmit(onSaveName)}
          className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-body-strong font-semibold text-ink">
            <User className="h-4 w-4 text-mute" />
            Tên hiển thị
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="profile-full-name">Tên hiển thị *</Label>
            <Input
              id="profile-full-name"
              type="text"
              placeholder="Nhập tên hiển thị"
              {...nameForm.register('full_name')}
              className={nameErrors.full_name ? 'border-sale' : ''}
            />
            {nameErrors.full_name && (
              <p className="text-caption-sm text-sale">
                {nameErrors.full_name.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={savingName}>
            {savingName ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Lưu tên hiển thị
          </Button>
        </form>

        {/* ── Prison switcher (regular admin only) ── */}
        {!isSuperAdmin && (
          <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-body-strong font-semibold text-ink">
              <Building2 className="h-4 w-4 text-mute" />
              Trại giam đang làm việc
            </h2>
            <p className="text-caption-sm text-mute">
              Bạn chỉ có thể chuyển đến các trại giam đã được quản trị viên cấp
              cao phân công. Dữ liệu của mỗi trại giam là độc lập.
            </p>
            <div className="space-y-1.5">
              <Label>Trại giam *</Label>
              <Select
                value={selectedPrisonId}
                onValueChange={setSelectedPrisonId}
                disabled={switching || profile.assigned_prisons.length <= 1}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trại giam" />
                </SelectTrigger>
                <SelectContent>
                  {profile.assigned_prisons.map((prison) => (
                    <SelectItem key={prison.id} value={prison.id}>
                      {prison.name} ({prison.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profile.assigned_prisons.length <= 1 && (
                <p className="text-caption-sm text-mute">
                  Bạn hiện chỉ được phân công vào một trại giam.
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={onSwitchPrison}
              disabled={
                switching ||
                !selectedPrisonId ||
                selectedPrisonId === profile.active_prison?.id
              }
            >
              {switching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="mr-2 h-4 w-4" />
              )}
              Chuyển trại giam
            </Button>
          </div>
        )}

        {/* ── Change password ── */}
        <form
          onSubmit={passwordForm.handleSubmit(onSavePassword)}
          className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-sm lg:col-span-1"
        >
          <h2 className="flex items-center gap-2 text-body-strong font-semibold text-ink">
            <KeyRound className="h-4 w-4 text-mute" />
            Đổi mật khẩu
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="profile-current-password">Mật khẩu hiện tại *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu hiện tại"
                {...passwordForm.register('current_password')}
                className={`pl-10 ${pwErrors.current_password ? 'border-sale' : ''}`}
              />
            </div>
            {pwErrors.current_password && (
              <p className="text-caption-sm text-sale">
                {pwErrors.current_password.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-new-password">Mật khẩu mới *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Tối thiểu 8 ký tự"
                {...passwordForm.register('new_password')}
                className={`pl-10 ${pwErrors.new_password ? 'border-sale' : ''}`}
              />
            </div>
            {pwErrors.new_password && (
              <p className="text-caption-sm text-sale">
                {pwErrors.new_password.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-confirm-password">
              Xác nhận mật khẩu mới *
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                {...passwordForm.register('confirm_password')}
                className={`pl-10 ${pwErrors.confirm_password ? 'border-sale' : ''}`}
              />
            </div>
            {pwErrors.confirm_password && (
              <p className="text-caption-sm text-sale">
                {pwErrors.confirm_password.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            Đổi mật khẩu
          </Button>
        </form>
      </div>
    </div>
  );
}
