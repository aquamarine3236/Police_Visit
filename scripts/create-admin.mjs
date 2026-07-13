import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file manually to avoid dependency requirement
const envPath = path.resolve(__dirname, '../.env');
let supabaseUrl = '';
let supabaseServiceKey = '';

try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // strip quotes
        if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = value;
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseServiceKey = value;
      }
    }
  }
} catch (e) {
  console.error('⚠️ Không thể đọc file .env:', e.message);
}

const DEFAULT_PRISON_ID = '11111111-1111-1111-1111-111111111111';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Lỗi: Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || 'admin@test.com';
  const password = args[1] || 'Admin@123456';
  const fullName = args[2] || 'Quản trị viên Thử nghiệm';

  console.log(`🚀 Bắt đầu tạo tài khoản admin:`);
  console.log(`   - Email: ${email}`);
  console.log(`   - Mật khẩu: ${password}`);
  console.log(`   - Họ tên: ${fullName}`);

  // 1. Tạo tài khoản trong auth.users
  const { data: userData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true
  });

  if (authError) {
    console.error('❌ Lỗi khi tạo tài khoản Auth:', authError.message);
    process.exit(1);
  }

  const userId = userData.user.id;
  console.log(`✅ Đã tạo tài khoản Auth thành công. ID: ${userId}`);

  // 2. Kiểm tra/Tạo trại giam mẫu nếu chưa tồn tại
  const { data: prisonData, error: prisonError } = await supabase
    .from('prisons')
    .select('id')
    .eq('id', DEFAULT_PRISON_ID)
    .maybeSingle();

  if (prisonError) {
    console.error('❌ Lỗi khi kiểm tra thông tin Trại giam:', prisonError.message);
    process.exit(1);
  }

  if (!prisonData) {
    console.log(`ℹ️ Không tìm thấy Trại giam mẫu. Đang tạo mới...`);
    const { error: insertPrisonError } = await supabase
      .from('prisons')
      .insert({
        id: DEFAULT_PRISON_ID,
        name: 'Trại giam mẫu',
        code: 'PRISON-001',
        address: 'Địa chỉ mẫu',
        phone: '0123456789',
        is_active: true
      });

    if (insertPrisonError) {
      console.error('❌ Lỗi khi tạo Trại giam mẫu:', insertPrisonError.message);
      process.exit(1);
    }
    console.log(`✅ Đã tạo Trại giam mẫu thành công.`);
  }

  // 3. Chèn hồ sơ admin vào table admin_profiles
  const { error: profileError } = await supabase
    .from('admin_profiles')
    .insert({
      id: userId,
      prison_id: DEFAULT_PRISON_ID,
      full_name: fullName,
      role: 'admin',
      is_active: true
    });

  if (profileError) {
    console.error('❌ Lỗi khi tạo Admin Profile:', profileError.message);
    // Rollback: Xóa user vừa tạo trong auth
    await supabase.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  console.log(`🎉 Tạo tài khoản admin thành công! Bạn có thể dùng tài khoản này để đăng nhập.`);
}

main().catch(err => {
  console.error('❌ Lỗi không mong muốn:', err);
});
