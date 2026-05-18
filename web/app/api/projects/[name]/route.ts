import { NextResponse } from 'next/server';
import {
  getProject,
  projectErrorResponse,
  softDeleteProject,
  updateProject,
} from '@/app/lib/server/projects/project-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { listChapters } from '@/app/lib/server/source/source-service';
import { listScriptVersions } from '@/app/lib/server/script/script-service';
import {
  getLatestAdaptationPlan,
  getCombinedStoryOutline,
} from '@/app/lib/server/script/text-artifact-service';
import {
  getProjectDescription,
  getChapters,
  getStoryline,
  getOutline,
  getScripts,
  getAssets,
  getSeedanceManifest,
  getProductionModes,
  getSkeleton,
  getAdaptation,
} from '@/app/lib/novels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name: rawName } = await params;
  const name = normalizeIdentifier(rawName);

  try {
    const project = await getProject(name);
    if (project) {
      const [chapters, scripts, skeleton, adaptation] = await Promise.all([
        listChapters(project.id),
        listScriptVersions(project.id),
        getCombinedStoryOutline(project.id),
        getLatestAdaptationPlan(project.id),
      ]);
      return NextResponse.json({
        ...project,
        chapterCount: project.chapterCount,
        chapters,
        storyline: '',
        outline: null,
        scripts,
        assets: [],
        seedanceManifest: null,
        productionMode: null,
        skeleton,
        adaptation,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const [description, chapters, storyline, outline, scripts, assets, skeleton, adaptation] =
      await Promise.all([
        getProjectDescription(name).catch(() => ''),
        getChapters(name).catch(() => []),
        getStoryline(name).catch(() => ''),
        getOutline(name).catch(() => null),
        getScripts(name).catch(() => []),
        getAssets(name).catch(() => []),
        getSkeleton(name).catch(() => ''),
        getAdaptation(name).catch(() => ''),
      ]);

    const [seedanceManifest, productionModes] = await Promise.all([
      getSeedanceManifest(name).catch(() => null),
      getProductionModes(name).catch(() => null),
    ]);

    const productionMode: 'seedance' | null = productionModes?.seedance?.hasData ? 'seedance' : null;

    return NextResponse.json({
      name,
      description,
      chapterCount: chapters.length,
      chapters,
      storyline,
      outline,
      scripts,
      assets,
      seedanceManifest,
      productionMode,
      skeleton,
      adaptation,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error(`获取项目 ${name} 详情失败:`, error);
    return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const project = await updateProject(normalizeIdentifier(name), await request.json());
    return NextResponse.json(project);
  } catch (error) {
    const response = projectErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const result = await softDeleteProject(normalizeIdentifier(name));
    return NextResponse.json(result);
  } catch (error) {
    const response = projectErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
