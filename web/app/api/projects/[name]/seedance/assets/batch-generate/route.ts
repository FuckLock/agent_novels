import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import path from 'path';
import {
  getSeedanceAssets,
  batchUpdateAssetField,
  saveBatchTask,
  updateBatchTask,
} from '@/app/lib/novels';
import {
  getModels,
  getModelById,
  generateImage,
  downloadImage,
} from '@/app/lib/ai-client';
import { recordAssetGenerationSnapshot, submitAssetImageTask } from '@/app/lib/server/assets/asset-generation-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import type { ModelConfig } from '@/app/lib/novels';
import type { SeedanceAsset } from '@/app/projects/[name]/types';

const NOVELS_DIR = path.join(process.cwd(), '..', 'novels');

/** 资产类型到图片存储子目录的映射 */
const TYPE_TO_DIR: Record<string, string> = {
  character: 'characters',
  scene: 'scenes',
  prop: 'props',
  costume: 'costumes',
  makeup: 'makeup',
};

/** 资产类型到 aspectRatio 的映射 */
const TYPE_ASPECT_RATIO: Record<string, string> = {
  character: '1:1',
  scene: '1:1',    // 四视图 2×2 网格需要方形画布
  prop: '1:1',
  costume: '1:1',
  makeup: '1:1',
};

/** 简单信号量：控制并发数量 */
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

/** 场景四视图前缀：模型对 prompt 开头权重最高，必须在最前面声明四视图 */
const SCENE_GRID_PREFIX = `古风场景四视图设定图，3D国漫风格，UE5渲染画质，PBR材质，电影级光影，scene design sheet, environment concept art, no people, no characters, no human figures，同一画面2×2网格排列：上排（前视图+右视图），下排（后视图+左视图），从场景中心点环视，四视图均从同一中心点平视拍摄，建筑结构一致，材质色调一致，光影逻辑一致，画面中无任何人物，图中不要有任何文字，\n\n`;

/** 原始 prompt 中与四视图冲突的词汇，需要替换掉 */
const SCENE_CONFLICT_PATTERNS: [RegExp, string][] = [
  [/全景广角镜头/g, '四视图设定图'],
  [/全景镜头/g, '四视图设定图'],
  [/全景视角/g, '四视图'],
  [/全景，/g, ''],
  [/全景/g, '四视图'],
  [/Wide Shot/gi, 'scene design sheet'],
  [/广角镜头/g, ''],
];

/** 构建最终提示词：场景资产注入四视图前缀 + 去除冲突词 */
function buildFinalPrompt(asset: SeedanceAsset): string {
  if (asset.type === 'scene' && !/2×2|四视图|网格排列|四宫格/.test(asset.prompt)) {
    let cleaned = asset.prompt;
    for (const [pattern, replacement] of SCENE_CONFLICT_PATTERNS) {
      cleaned = cleaned.replace(pattern, replacement);
    }
    return SCENE_GRID_PREFIX + cleaned;
  }
  return asset.prompt;
}

/** 处理单个资产的图片生成，返回是否成功 */
async function processOneAsset(
  projectName: string,
  asset: SeedanceAsset,
  model: ModelConfig,
  resolution: string
): Promise<boolean> {
  try {
    // 构建最终提示词（场景自动追加四视图布局）
    const finalPrompt = buildFinalPrompt(asset);

    // 生成图片：由模型 adapter 决定走官方直出还是第三方任务轮询
    const result = await generateImage(model, finalPrompt, {
      size: resolution,
      aspectRatio: TYPE_ASPECT_RATIO[asset.type] || '16:9',
      onTaskId: async (taskId) => {
        await batchUpdateAssetField(projectName, [
          {
            id: asset.id,
            fields: {
              apiTaskId: taskId,
            },
          },
        ]);
      },
    });

    if (result.status === 'success' && result.imageUrl) {
      // 构造保存路径
      const typeDir = TYPE_TO_DIR[asset.type] || 'others';
      const sanitizedFileName = path.basename(asset.name.replace(/[/\\?%*:|"<>]/g, '_')) || asset.id;
      const versionedFileName = `${sanitizedFileName}-${Date.now()}-${randomUUID().slice(0, 8)}.png`;
      const savePath = path.join(
        NOVELS_DIR,
        projectName,
        'seedance',
        'images',
        typeDir,
        versionedFileName
      );

      // 下载图片
      await downloadImage(result.imageUrl, savePath);

      // 计算相对路径（相对于项目根的路径，用于前端展示）
      const relativePath = `seedance/images/${typeDir}/${versionedFileName}`;

      await batchUpdateAssetField(projectName, [
        {
          id: asset.id,
          fields: {
            state: 'success',
            imagePath: relativePath,
            generatedAt: new Date().toISOString(),
            apiTaskId: result.taskId,
          },
        },
      ]);
      await recordAssetGenerationSnapshot(projectName).catch((err) => {
        console.warn('同步资产图片版本失败:', err);
      });
      await submitAssetImageTask(projectName, asset.id, {
        imagePath: relativePath,
        imageUrl: result.imageUrl,
        prompt: finalPrompt,
        modelId: model.modelId,
        resolution,
        apiTaskId: result.taskId,
        state: 'success',
      }).catch((err) => {
        console.warn('归档图片生成 AgentRun 失败:', err);
      });
      return true;
    } else {
      // 生成失败
      await batchUpdateAssetField(projectName, [
        {
          id: asset.id,
          fields: {
            state: 'failed',
            error: result.error || '图片生成失败',
            apiTaskId: result.taskId,
          },
        },
      ]);
      await recordAssetGenerationSnapshot(projectName).catch((err) => {
        console.warn('同步资产失败版本失败:', err);
      });
      await submitAssetImageTask(projectName, asset.id, {
        imagePath: '',
        imageUrl: '',
        prompt: finalPrompt,
        modelId: model.modelId,
        resolution,
        apiTaskId: result.taskId,
        state: 'failed',
        error: result.error || '图片生成失败',
      }).catch((err) => {
        console.warn('归档图片生成失败 AgentRun 失败:', err);
      });
      return false;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '图片生成失败';
    console.error(`资产 ${asset.id} 图片生成失败:`, errorMsg);
    await batchUpdateAssetField(projectName, [
      {
        id: asset.id,
        fields: {
          state: 'failed',
          error: errorMsg,
        },
      },
    ]);
    await recordAssetGenerationSnapshot(projectName).catch((syncError) => {
      console.warn('同步资产异常版本失败:', syncError);
    });
    return false;
  }
}

/** 后台异步处理：并发控制图片生成 */
async function processGenerateBatch(
  projectName: string,
  assets: SeedanceAsset[],
  model: ModelConfig,
  resolution: string,
  batchId: string
): Promise<void> {
  const semaphore = new Semaphore(3); // 最多 3 个并行
  let succeeded = 0;
  let failed = 0;

  const tasks = assets.map(async (asset) => {
    await semaphore.acquire();
    try {
      const ok = await processOneAsset(projectName, asset, model, resolution);
      if (ok) {
        succeeded++;
      } else {
        failed++;
      }
    } finally {
      semaphore.release();
      // 更新批次任务进度
      await updateBatchTask(projectName, batchId, {
        completed: succeeded + failed,
        succeeded,
        failed,
      });
    }
  });

  await Promise.allSettled(tasks);

  // 标记批次任务完成
  await updateBatchTask(projectName, batchId, {
    completed: succeeded + failed,
    succeeded,
    failed,
    isComplete: true,
    completedAt: new Date().toISOString(),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  try {
    const body = await request.json();
    const { assetIds, modelId: requestModelId, resolution: requestResolution, overwrite } = body as {
      assetIds: string[];
      modelId?: string;
      resolution?: string;
      overwrite?: boolean;
    };

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: '缺少必填字段：assetIds（非空数组）' },
        { status: 400 }
      );
    }

    // 确定图片模型
    let model: ModelConfig | null = null;
    if (requestModelId) {
      model = await getModelById(requestModelId, 'image');
      if (!model) {
        return NextResponse.json(
          { error: `图像模型 ${requestModelId} 不存在` },
          { status: 400 }
        );
      }
      if (model.enabled === false) {
        return NextResponse.json(
          { error: `图像模型 ${requestModelId} 已禁用` },
          { status: 400 }
        );
      }
    } else {
      const imageModels = (await getModels('image')).filter((m) => m.enabled !== false);
      if (imageModels.length === 0) {
        return NextResponse.json(
          { error: '没有可用的图片模型，请先在 config/models/ 中配置' },
          { status: 500 }
        );
      }
      model = imageModels[0];
    }

    const resolution = requestResolution
      || (model.defaultParams?.imageSize as string)
      || (model.defaultParams?.size as string)
      || '';
    const modelId = model.modelId;

    const allAssets = await getSeedanceAssets(decodedName);
    const assetIdSet = new Set(assetIds);

    // 筛选待处理资产：必须有 prompt，且无图片或允许覆盖
    const toProcess: SeedanceAsset[] = [];
    let skipped = 0;

    for (const asset of allAssets) {
      if (!assetIdSet.has(asset.id)) continue;
      // 没有 prompt 的跳过
      if (!asset.prompt) {
        skipped++;
        continue;
      }
      // 如果不覆盖，跳过已成功生成的
      if (!overwrite && asset.state === 'success' && asset.imagePath) {
        skipped++;
        continue;
      }
      toProcess.push(asset);
    }

    const batchId = `batch-generate-${Date.now()}`;

    // 将待处理资产标记为 generating
    if (toProcess.length > 0) {
      await batchUpdateAssetField(
        decodedName,
        toProcess.map((a) => ({
          id: a.id,
          fields: {
            state: 'generating' as const,
            modelId,
            resolution,
            error: undefined,
          },
        }))
      );
    }

    // 保存批次任务记录
    await saveBatchTask(decodedName, {
      batchId,
      type: 'generate',
      assetIds: toProcess.map((a) => a.id),
      total: toProcess.length,
      createdAt: new Date().toISOString(),
      modelId,
      resolution,
    });

    // 不阻塞请求，后台异步处理
    void processGenerateBatch(decodedName, toProcess, model, resolution, batchId);

    return NextResponse.json({
      batchId,
      total: toProcess.length,
      skipped,
    });
  } catch (error) {
    console.error('批量生成图片失败:', error);
    return NextResponse.json(
      { error: '批量生成图片失败' },
      { status: 500 }
    );
  }
}
