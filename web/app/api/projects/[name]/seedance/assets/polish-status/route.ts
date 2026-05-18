import { NextResponse } from 'next/server';
import { getSeedanceAssets, getBatchTask } from '@/app/lib/novels';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json(
        { error: '缺少必填参数：batchId' },
        { status: 400 }
      );
    }

    const task = await getBatchTask(name, batchId);
    if (!task || task.type !== 'polish') {
      return NextResponse.json(
        { error: '批次任务不存在' },
        { status: 404 }
      );
    }

    const allAssets = await getSeedanceAssets(name);
    const taskAssetIds = new Set(task.assetIds);

    const assetStatuses: Array<{
      id: string;
      promptState: string;
      promptError?: string;
    }> = [];

    let completed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const asset of allAssets) {
      if (!taskAssetIds.has(asset.id)) continue;
      const state = asset.promptState ?? 'pending';
      assetStatuses.push({
        id: asset.id,
        promptState: state,
        ...(asset.promptError ? { promptError: asset.promptError } : {}),
      });
      if (state === 'completed') {
        completed++;
        succeeded++;
      } else if (state === 'failed') {
        completed++;
        failed++;
      }
    }

    const isComplete = completed === task.total;

    return NextResponse.json({
      batchId,
      total: task.total,
      completed,
      succeeded,
      failed,
      isComplete,
      assets: assetStatuses,
    });
  } catch (error) {
    console.error('查询提示词生成状态失败:', error);
    return NextResponse.json(
      { error: '查询提示词生成状态失败' },
      { status: 500 }
    );
  }
}
