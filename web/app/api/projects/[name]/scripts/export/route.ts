import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { writeArtifact } from '@/app/lib/server/artifacts/store';
import { getLatestScriptContent } from '@/app/lib/server/script/script-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const body = await request.json().catch((): { episodes?: unknown } => ({}));
  const rawEpisodes = (body as { episodes?: unknown }).episodes;
  const episodes = Array.isArray(rawEpisodes)
    ? rawEpisodes.map(Number).filter((item: number) => Number.isInteger(item) && item > 0)
    : [];
  if (episodes.length === 0) {
    return NextResponse.json({ error: '请选择要导出的集数' }, { status: 400 });
  }

  const parts = await Promise.all(
    episodes.map(async (episode) => {
      const content = await getLatestScriptContent(name, episode);
      return `=== 第${episode}集 ===\n\n${content || '(无内容)'}\n\n`;
    }),
  );
  const content = parts.join('\n');
  const artifact = await writeArtifact({
    content,
    mimeType: 'text/plain',
    sourceType: 'generated',
    originalName: `${decodeURIComponent(name)}-scripts.txt`,
    objectType: 'script_export',
    objectId: decodeURIComponent(name),
  });

  return NextResponse.json({
    artifactId: artifact.id,
    filename: `${decodeURIComponent(name)}-剧本-${episodes.length}集.txt`,
    content,
  });
}
