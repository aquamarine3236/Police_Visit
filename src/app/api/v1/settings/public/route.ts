import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    suitable_days: [4, 5],
    guidelines: 'Chọn ngày phù hợp để đăng ký thăm gặp.',
  });
}
