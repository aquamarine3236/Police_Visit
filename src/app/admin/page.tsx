import { logout } from '@/actions/auth';

export default function AdminPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Admin dashboard</p>
        <p className="mt-2 text-sm text-slate-600">
          Quản trị viên đã được xác thực và có thể quản lý hệ thống.
        </p>
        <form action={logout} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
}
