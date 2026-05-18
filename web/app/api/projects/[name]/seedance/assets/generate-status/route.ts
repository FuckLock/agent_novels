import { NextResponse } from 'next/server';
import { getSeedanceAssets, getBatchTask, batchMarkStuckAssetsFailed, updateBatchTask } from '@/app/lib/novels';
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
    if (!task || task.type !== 'generate') {
      return NextResponse.json(
        { error: '批次任务不存在' },
        { status: 404 }
      );
    }

    const allAssets = await getSeedanceAssets(name);
    const taskAssetIds = new Set(task.assetIds);

    const assetStatuses: Array<{
      id: string;
      state: string;
      imagePath?: string;
      error?: string;
    }> = [];

    let completed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const asset of allAssets) {
      if (!taskAssetIds.has(asset.id)) continue;
      assetStatuses.push({
        id: asset.id,
        state: asset.state,
        ...(asset.imagePath ? { imagePath: asset.imagePath } : {}),
        ...(asset.error ? { error: asset.error } : {}),
      });
      if (asset.state === 'success') {
        completed++;
        succeeded++;
      } else if (asset.state === 'failed') {
        completed++;
        failed++;
      }
    }

    // stuck 检测：batch 创建超 30 分钟仍有 generating 状态的资产，自动标记为 failed
    const STUCK_TIMEOUT_MS = 30 * 60 * 1000;
    const batchCreated = new Date(task.createdAt).getTime();
    const batchAge = isNaN(batchCreated) ? 0 : (Date.now() - batchCreated);
    if (batchAge > STUCK_TIMEOUT_MS) {
      const stuckCandidates = assetStatuses.filter(a => a.state === 'generating');
      if (stuckCandidates.length > 0) {
        // 在锁内重新读取 state，仅覆盖仍为 generating 的资产，避免竞态覆盖已成功的资产
        const markedIds = await batchMarkStuckAssetsFailed(
          name,
          stuckCandidates.map(a => a.id),
          '生成超时：任务异常终止'
        );
        // 同步更新本次响应中的状态（仅更新实际被标记的资产）
        const markedSet = new Set(markedIds);
        for (const a of stuckCandidates) {
          if (markedSet.has(a.id)) {
            a.state = 'failed';
            a.error = '生成超时：任务异常终止';
            completed++;
            failed++;
          }
        }
      }
    }

    const isComplete = completed === task.total;

    // 如果已完成但 tasks.json 中缺少 isComplete 标记，补写
    if (isComplete && !task.isComplete) {
      await updateBatchTask(name, batchId, {
        isComplete: true,
        completed,
        succeeded,
        failed,
        completedAt: new Date().toISOString(),
      });
    }

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
    console.error('查询图片生成状态失败:', error);
    return NextResponse.json(
      { error: '查询图片生成状态失败' },
      { status: 500 }
    );
  }
}
