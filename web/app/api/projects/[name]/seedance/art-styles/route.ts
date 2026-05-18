import { NextResponse } from 'next/server';
import { getArtStyles } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

/** GET /api/projects/[name]/seedance/art-styles — 返回可用的美术风格列表 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  // 虽然 art-styles 是全局的（不依赖项目），但路由放在项目下保持一致性
  // params 可用于未来按项目筛选风格
  await params; // consume params to avoid Next.js warning

  try {
    const styles = await getArtStyles();
    return NextResponse.json({ styles });
  } catch (error) {
    console.error('获取美术风格列表失败:', error);
    return NextResponse.json(
      { error: '获取美术风格列表失败' },
      { status: 500 }
    );
  }
}
