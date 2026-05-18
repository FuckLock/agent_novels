import { NextResponse } from 'next/server';
import { getAssetImagePath } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; path: string[] }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name, path: segments } = await params;

  // 构建图片路径
  const imagePath = getAssetImagePath(name, ...segments);

  try {
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: '图片不存在' }, { status: 404 });
  }
}
