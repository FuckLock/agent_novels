// runtime: nodejs
// /api/projects/[name]/episode-delivery-package —— Phase 11 单集交付包 manifest 生成 / 查询
// spec L605 + DEV-PLAN L535
//
// 边界（spec L611 + DEV-PLAN L544）：本路由属于路径 4 主 Tab，不在 settings 下；
// 与整工程迁移包（spec 设置降级页）分离。
//
// GET  ?roughCutId=...           —— 列出某 RoughCut 的交付包历史
// GET  ?packageId=...            —— 取指定交付包详情
// POST { roughCutId, audioSubtitlePlanId? } —— 组装新的交付包 manifest（6 件清单 + 缺失检查）

import { NextResponse } from 'next/server';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { ensureSchema } from '@/app/lib/server/db/migrate';
import { getProject } from '@/app/lib/server/projects/project-service';
import {
  assembleDeliveryPackage,
  listDeliveryPackages,
  getDeliveryPackageById,
} from '@/app/lib/server/delivery/episode-package-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeIdentifier(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * GET /api/projects/[name]/episode-delivery-package?roughCutId=... | packageId=...
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const url = new URL(request.url);
    const roughCutId = url.searchParams.get('roughCutId') || '';
    const packageId = url.searchParams.get('packageId') || '';

    await ensureSchema();

    if (packageId) {
      const pkg = getDeliveryPackageById(packageId);
      if (!pkg) {
        return NextResponse.json({ error: '交付包不存在' }, { status: 404 });
      }
      return NextResponse.json({ projectName: name, package: pkg });
    }

    if (!roughCutId) {
      return NextResponse.json(
        { error: '缺少 roughCutId 或 packageId 参数' },
        { status: 400 },
      );
    }

    const list = listDeliveryPackages(roughCutId);
    return NextResponse.json({
      projectName: name,
      roughCutId,
      packages: list,
      count: list.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: `加载 EpisodeDeliveryPackage 失败：${message}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[name]/episode-delivery-package { roughCutId, audioSubtitlePlanId? }
 *
 * 组装单集交付包（manifest 6 件清单 + 缺失检查）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'POST body 必须是 JSON' }, { status: 400 });
  }

  try {
    const { name: rawName } = await params;
    const name = normalizeIdentifier(rawName);
    const project = await getProject(name);
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const roughCutId = String(body.roughCutId || '').trim();
    if (!roughCutId) {
      return NextResponse.json({ error: '缺少 roughCutId' }, { status: 400 });
    }
    const audioSubtitlePlanId = body.audioSubtitlePlanId
      ? String(body.audioSubtitlePlanId)
      : undefined;

    await ensureSchema();
    const record = await assembleDeliveryPackage({
      roughCutId,
      audioSubtitlePlanId,
    });

    return NextResponse.json(
      {
        ok: true,
        packageId: record.id,
        status: record.status,
        roughCutId: record.roughCutId,
        audioSubtitlePlanId: record.audioSubtitlePlanId,
        missingCheck: record.manifest.missingCheck,
        assetCount: record.manifest.assets.length,
        record,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: `组装 EpisodeDeliveryPackage 失败：${message}` },
      { status: 500 },
    );
  }
}
