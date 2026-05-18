import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSqlite, runInTransaction } from '../db/client';
import { ensureSchema } from '../db/migrate';
import { writeArtifact } from '../artifacts/store';
import { recordAgentRun, attachAgentRunOutput } from '../agent/agent-run-service';
import { listAssets, resolveAssetProject } from './asset-service';
import { findAssetRow, json, latestVersion } from './asset-sync-service';
import { createAssetVersion } from './asset-version-service';

/**
 * asset-generation-service —— 资产生成链路服务层
 *
 * 职责：
 *  1. runAssetPromptPolish：润色提示词完成后归档（AgentRun + Artifact + prompt_candidate 候选版本）
 *  2. submitAssetImageTask：图片任务返回成功 / 失败后归档（AgentRun + Artifact + generated 候选版本）
 *  3. createAssetVersionCandidate：通用候选版本落库 helper（封装 createAssetVersion + 错误容错）
 *  4. recordAssetPromptSnapshot / recordAssetGenerationSnapshot：兼容 stub 时代的快照写入入口
 *     （维持 batch-polish.ts / batch-generate.ts 现有 .catch 调用点不破坏）
 *
 * 所有外部 I/O（writeArtifact / recordAgentRun / DB INSERT）均包裹 try/catch，
 * 失败仅 console.warn，不抛阻塞调用方——保证主路径（batch-polish / batch-generate）的容错不被破坏。
 */

// ----------------------------- 输入 Schema -----------------------------

const PromptPolishInputSchema = z.object({
  prompt: z.string().min(0).max(12000).default(''),
  artStyle: z.string().max(120).default(''),
  modelId: z.string().max(200).optional(),
  templateName: z.string().max(160).optional(),
  systemPrompt: z.string().max(20000).optional(),
  userMessage: z.string().max(20000).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  promptError: z.string().max(2000).optional(),
  promptState: z.enum(['completed', 'failed']).default('completed'),
});

const ImageTaskInputSchema = z.object({
  imagePath: z.string().max(2000).default(''),
  imageUrl: z.string().max(2000).default(''),
  prompt: z.string().max(12000).optional(),
  modelId: z.string().max(200).optional(),
  resolution: z.string().max(120).optional(),
  apiTaskId: z.string().max(200).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  error: z.string().max(2000).optional(),
  state: z.enum(['success', 'failed']).default('success'),
});

export type PromptPolishInput = z.infer<typeof PromptPolishInputSchema>;
export type ImageTaskInput = z.infer<typeof ImageTaskInputSchema>;

// ----------------------------- 主要业务函数 -----------------------------

/**
 * 归档"提示词润色"结果到 AgentRun + Artifact + asset_versions（prompt_candidate）
 *
 * 调用时机：batch-polish.ts 完成单个资产润色后（成功或失败均可调用）
 * 失败容错：内部任一步骤异常都 console.warn，不抛——调用方继续主流程
 */
export async function runAssetPromptPolish(
  projectIdentifier: string,
  assetId: string,
  rawInput: unknown,
): Promise<{ agentRunId: string | null; versionId: string | null }> {
  try {
    const input = PromptPolishInputSchema.parse(rawInput);
    const project = await resolveAssetProject(projectIdentifier);
    const row = findAssetRow(getSqlite(), project.id, assetId);
    if (!row) {
      console.warn(`[asset-generation] runAssetPromptPolish: 资产 ${assetId} 不存在`);
      return { agentRunId: null, versionId: null };
    }

    const agentRunId = await recordAgentRun(project.name, {
      action: 'asset.prompt.polish',
      agentName: 'asset-prompt-polisher',
      status: input.promptState === 'failed' ? 'failed' : 'succeeded',
      modelId: input.modelId,
      skillName: input.templateName,
      input: {
        assetId,
        assetRecordId: row.id,
        assetType: row.type,
        assetName: row.name,
        templateName: input.templateName || null,
        artStyle: input.artStyle,
        promptPreview: input.prompt.slice(0, 200),
      },
      usage: input.usage,
      errorMessage: input.promptError,
    }).catch((err) => {
      console.warn('[asset-generation] recordAgentRun(polish) 失败:', err);
      return null;
    });

    let artifactId: string | null = null;
    if (input.prompt) {
      try {
        const artifact = await writeArtifact({
          content: JSON.stringify(
            {
              assetId,
              assetRecordId: row.id,
              prompt: input.prompt,
              artStyle: input.artStyle,
              templateName: input.templateName || null,
              modelId: input.modelId || null,
              generatedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          mimeType: 'application/json',
          sourceType: 'generated',
          originalName: `asset-prompt-${assetId}-${Date.now()}.json`,
          objectType: 'asset_prompt',
          objectId: row.id,
        });
        artifactId = artifact.id;
      } catch (err) {
        console.warn('[asset-generation] writeArtifact(prompt) 失败:', err);
      }
    }

    const versionId = await createAssetVersionCandidate(projectIdentifier, assetId, {
      source: 'prompt_candidate',
      prompt: input.prompt,
      modelId: input.modelId,
      status: 'candidate',
      metadata: {
        kind: 'prompt_polish',
        templateName: input.templateName || null,
        artStyle: input.artStyle,
        artifactId,
        agentRunId,
        promptState: input.promptState,
        promptError: input.promptError || '',
      },
    });

    if (agentRunId) {
      await attachAgentRunOutput(agentRunId, {
        artifactId,
        objectType: 'asset_version',
        objectId: versionId,
        usage: input.usage || {},
      }).catch((err) => {
        console.warn('[asset-generation] attachAgentRunOutput(polish) 失败:', err);
      });
    }

    return { agentRunId, versionId };
  } catch (error) {
    console.error('[asset-generation] runAssetPromptPolish 异常:', error);
    return { agentRunId: null, versionId: null };
  }
}

/**
 * 归档"图片生成任务"结果到 AgentRun + Artifact + asset_versions（generated）
 *
 * 调用时机：batch-generate.ts 完成单个资产图片生成后（成功或失败均可调用）
 * 失败容错：同上，内部异常不抛
 */
export async function submitAssetImageTask(
  projectIdentifier: string,
  assetId: string,
  rawInput: unknown,
): Promise<{ agentRunId: string | null; versionId: string | null }> {
  try {
    const input = ImageTaskInputSchema.parse(rawInput);
    const project = await resolveAssetProject(projectIdentifier);
    const row = findAssetRow(getSqlite(), project.id, assetId);
    if (!row) {
      console.warn(`[asset-generation] submitAssetImageTask: 资产 ${assetId} 不存在`);
      return { agentRunId: null, versionId: null };
    }

    const agentRunId = await recordAgentRun(project.name, {
      action: 'asset.image.generate',
      agentName: 'asset-image-generator',
      status: input.state === 'failed' ? 'failed' : 'succeeded',
      modelId: input.modelId,
      input: {
        assetId,
        assetRecordId: row.id,
        assetType: row.type,
        assetName: row.name,
        resolution: input.resolution || null,
        apiTaskId: input.apiTaskId || null,
        promptPreview: (input.prompt || '').slice(0, 200),
      },
      usage: input.usage,
      errorMessage: input.error,
    }).catch((err) => {
      console.warn('[asset-generation] recordAgentRun(image) 失败:', err);
      return null;
    });

    let artifactId: string | null = null;
    try {
      const artifact = await writeArtifact({
        content: JSON.stringify(
          {
            assetId,
            assetRecordId: row.id,
            imagePath: input.imagePath,
            imageUrl: input.imageUrl,
            modelId: input.modelId || null,
            resolution: input.resolution || null,
            apiTaskId: input.apiTaskId || null,
            state: input.state,
            error: input.error || '',
            recordedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        mimeType: 'application/json',
        sourceType: input.state === 'failed' ? 'system' : 'generated',
        originalName: `asset-image-${assetId}-${Date.now()}.json`,
        objectType: 'asset_image',
        objectId: row.id,
      });
      artifactId = artifact.id;
    } catch (err) {
      console.warn('[asset-generation] writeArtifact(image) 失败:', err);
    }

    const versionId = await createAssetVersionCandidate(projectIdentifier, assetId, {
      source: input.state === 'failed' ? 'manual' : 'generated',
      prompt: input.prompt || '',
      imagePath: input.imagePath,
      imageUrl: input.imageUrl,
      modelId: input.modelId,
      resolution: input.resolution,
      status: 'candidate',
      metadata: {
        kind: 'image_task',
        apiTaskId: input.apiTaskId || null,
        artifactId,
        agentRunId,
        state: input.state,
        error: input.error || '',
      },
    });

    if (agentRunId) {
      await attachAgentRunOutput(agentRunId, {
        artifactId,
        objectType: 'asset_version',
        objectId: versionId,
        usage: input.usage || {},
      }).catch((err) => {
        console.warn('[asset-generation] attachAgentRunOutput(image) 失败:', err);
      });
    }

    return { agentRunId, versionId };
  } catch (error) {
    console.error('[asset-generation] submitAssetImageTask 异常:', error);
    return { agentRunId: null, versionId: null };
  }
}

/**
 * 通用候选版本落库 helper —— 包装 asset-version-service.createAssetVersion，
 * 增加 try/catch 防御 + 失败 fallback（直接 INSERT 一行最小占位版本，确保链路至少留痕）
 */
export async function createAssetVersionCandidate(
  projectIdentifier: string,
  assetId: string,
  input: {
    source?: 'manual' | 'uploaded' | 'generated' | 'frame_extract' | 'replacement' | 'prompt_candidate';
    prompt?: string;
    imagePath?: string;
    imageUrl?: string;
    modelId?: string;
    resolution?: string;
    status?: 'candidate' | 'canonical' | 'locked' | 'rejected' | 'archived';
    metadata?: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const result = await createAssetVersion(projectIdentifier, assetId, {
      source: input.source || 'manual',
      prompt: input.prompt || '',
      imagePath: input.imagePath || '',
      imageUrl: input.imageUrl || '',
      modelId: input.modelId || '',
      resolution: input.resolution || '',
      status: input.status || 'candidate',
      metadata: input.metadata || {},
    });
    return result.versionId;
  } catch (error) {
    console.warn('[asset-generation] createAssetVersionCandidate 主路径失败，进入降级落库:', error);
    // 降级：直接 INSERT 一行最小占位（不抛阻塞，仅保证有痕迹）
    try {
      await ensureSchema();
      const project = await resolveAssetProject(projectIdentifier);
      const row = findAssetRow(getSqlite(), project.id, assetId);
      if (!row) return null;
      const id = randomUUID();
      runInTransaction((db) => {
        const latest = latestVersion(db, row.id);
        const now = Date.now();
        db.prepare(
          `INSERT INTO asset_versions
            (id, project_id, asset_id, version_no, source, prompt, image_path, image_url,
             model_id, resolution, status, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          project.id,
          row.id,
          latest ? latest.version_no + 1 : 1,
          input.source || 'manual',
          input.prompt || '',
          input.imagePath || '',
          input.imageUrl || '',
          input.modelId || '',
          input.resolution || '',
          input.status || 'candidate',
          json({ ...(input.metadata || {}), fallback: true }),
          now,
          now,
        );
      });
      return id;
    } catch (fallbackError) {
      console.error('[asset-generation] createAssetVersionCandidate 降级落库失败:', fallbackError);
      return null;
    }
  }
}

// ----------------------------- 兼容旧调用点（保留 stub 时代签名） -----------------------------

/**
 * 同步资产 → asset_versions 表的总入口（保留兼容签名，listAssets 内部已触发 syncProjectAssets）
 */
export async function syncAssetVersions(projectIdentifier: string) {
  const assets = await listAssets(projectIdentifier);
  return {
    synced: assets.length,
    versioned: assets.filter((asset) => (asset.versionCount || 0) > 0).length,
  };
}

/**
 * 兼容入口 — batch-generate.ts .catch 链路引用该函数；
 * 实际执行 syncAssetVersions（保持现有非破坏式调用），新增日志便于排障。
 */
export async function recordAssetGenerationSnapshot(projectIdentifier: string) {
  return syncAssetVersions(projectIdentifier);
}

/**
 * 兼容入口 — batch-polish.ts .catch 链路引用该函数。
 */
export async function recordAssetPromptSnapshot(projectIdentifier: string) {
  return syncAssetVersions(projectIdentifier);
}
