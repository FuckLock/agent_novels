import { NextResponse } from 'next/server';
import {
  getSeedanceAssets,
  batchUpdateAssetField,
  saveBatchTask,
  updateBatchTask,
  getArtTemplate,
} from '@/app/lib/novels';
import { callLanguageModel, getModels } from '@/app/lib/ai-client';
import { recordAssetPromptSnapshot } from '@/app/lib/server/assets/asset-generation-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import type { SeedanceAsset } from '@/app/projects/[name]/types';

/** 资产类型到美术模板文件名的映射 */
const TYPE_TO_TEMPLATE: Record<string, string> = {
  character: 'art_character.md',
  scene: 'art_scene.md',
  prop: 'art_prop.md',
  costume: 'art_character.md',
  makeup: 'art_character.md',
};

/** 资产类型到中文标签的映射 */
const TYPE_TO_LABEL: Record<string, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
  costume: '服装',
  makeup: '妆发',
};

/** 解析 AI 返回内容中的 [PROMPT] 和 [ARTSTYLE] 部分 */
function parsePolishResult(output: string): { prompt: string; artStyle: string } {
  let prompt = '';
  let artStyle = '';

  const promptMatch = output.match(/\[PROMPT\]\s*([\s\S]*?)(?=\[ARTSTYLE\]|$)/i);
  if (promptMatch) {
    prompt = promptMatch[1].trim();
  }

  const artStyleMatch = output.match(/\[ARTSTYLE\]\s*([\s\S]*?)$/i);
  if (artStyleMatch) {
    artStyle = artStyleMatch[1].trim();
  }

  // 如果没有标记，整体作为 prompt
  if (!prompt && !artStyle) {
    prompt = output.trim();
  }

  return { prompt, artStyle };
}

/** 处理单个资产的提示词生成 */
async function processSingleAsset(
  projectName: string,
  asset: SeedanceAsset,
  modelId: string,
  artStyle: string,
): Promise<boolean> {
  const templateFile = TYPE_TO_TEMPLATE[asset.type];
  let systemPrompt = '';
  if (templateFile) {
    try {
      systemPrompt = await getArtTemplate(artStyle, templateFile);
    } catch {
      console.warn(`美术模板读取失败: ${artStyle}/${templateFile}`);
    }
  }

  const label = TYPE_TO_LABEL[asset.type] || asset.type;
  const userMessage = `请为以下资产生成图片提示词（必须使用中文）：
名称：${asset.name}
类型：${label}
描述：${asset.description}

请输出两部分（全部使用中文）：
[PROMPT] 详细的中文图片生成提示词
[ARTSTYLE] 中文风格关键词`;

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userMessage });

  const output = await callLanguageModel(modelId, messages);
  const { prompt, artStyle: parsedArtStyle } = parsePolishResult(output);

  await batchUpdateAssetField(projectName, [
    {
      id: asset.id,
      fields: {
        prompt,
        artStyle: parsedArtStyle,
        promptState: 'completed',
        promptGeneratedAt: new Date().toISOString(),
      },
    },
  ]);
  await recordAssetPromptSnapshot(projectName).catch((err) => {
    console.warn('同步资产提示词版本失败:', err);
  });
  return true;
}

/** 后台异步处理：并发调用 AI 生成润色提示词 */
async function processPolishBatch(
  projectName: string,
  assets: SeedanceAsset[],
  modelId: string,
  artStyle: string,
  batchId: string
): Promise<void> {
  let succeeded = 0;
  let failed = 0;
  const CONCURRENCY = 3;

  // 分批并发处理
  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        try {
          await processSingleAsset(projectName, asset, modelId, artStyle);
          return { id: asset.id, ok: true };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '提示词生成失败';
          console.error(`资产 ${asset.id} 润色失败:`, errorMsg);
          await batchUpdateAssetField(projectName, [
            {
              id: asset.id,
              fields: { promptState: 'failed', promptError: errorMsg },
            },
          ]);
          await recordAssetPromptSnapshot(projectName).catch((syncError) => {
            console.warn('同步资产提示词失败版本失败:', syncError);
          });
          return { id: asset.id, ok: false };
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) succeeded++;
      else failed++;
    }

    await updateBatchTask(projectName, batchId, {
      completed: succeeded + failed,
      succeeded,
      failed,
    });
  }

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
    const { assetIds, modelId: requestModelId, overwrite, artStyle: requestArtStyle } = body as {
      assetIds: string[];
      modelId?: string;
      overwrite?: boolean;
      artStyle?: string;
    };

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: '缺少必填字段：assetIds（非空数组）' },
        { status: 400 }
      );
    }

    // 确定模型 ID：优先使用请求指定的，否则用第一个可用语言模型
    let modelId = requestModelId;
    if (!modelId) {
      const languageModels = await getModels('language');
      if (languageModels.length === 0) {
        return NextResponse.json(
          { error: '没有可用的语言模型，请先在 config/models/ 中配置' },
          { status: 500 }
        );
      }
      modelId = languageModels[0].modelId;
    }

    // 确定美术风格：默认 3d-guoman
    const artStyle = requestArtStyle || '3d-guoman';

    const allAssets = await getSeedanceAssets(decodedName);
    const assetIdSet = new Set(assetIds);

    // 筛选待处理资产
    const toProcess: SeedanceAsset[] = [];
    let skipped = 0;

    for (const asset of allAssets) {
      if (!assetIdSet.has(asset.id)) continue;
      // 如果不覆盖，跳过已有 prompt 的
      if (!overwrite && asset.prompt) {
        skipped++;
        continue;
      }
      toProcess.push(asset);
    }

    const batchId = `batch-polish-${Date.now()}`;

    // 将待处理资产的 promptState 标记为 generating
    if (toProcess.length > 0) {
      await batchUpdateAssetField(
        decodedName,
        toProcess.map((a) => ({
          id: a.id,
          fields: { promptState: 'generating' as const, promptError: undefined },
        }))
      );
    }

    // 保存批次任务记录
    await saveBatchTask(decodedName, {
      batchId,
      type: 'polish',
      assetIds: toProcess.map((a) => a.id),
      total: toProcess.length,
      createdAt: new Date().toISOString(),
      modelId,
    });

    // 不阻塞请求，后台异步处理
    void processPolishBatch(decodedName, toProcess, modelId, artStyle, batchId);

    return NextResponse.json({
      batchId,
      total: toProcess.length,
      skipped,
    });
  } catch (error) {
    console.error('批量生成提示词失败:', error);
    return NextResponse.json(
      { error: '批量生成提示词失败' },
      { status: 500 }
    );
  }
}
