// runtime: nodejs
import fs from 'fs/promises';
import path from 'path';
import { getModelConfigs, getSeedanceAssets, type ModelConfig } from '@/app/lib/novels';

const NOVELS_ROOT = path.join(process.cwd(), '..', 'novels');

type VideoTaskStatus = 'pending' | 'running' | 'success' | 'failed';

interface VideoTask {
  id: string;
  title: string;
  prompt?: string;
  status: VideoTaskStatus;
  providerTaskId: string | null;
  outputPath: string | null;
  modelId?: string;
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface TrackPrompt {
  id: string;
  title: string;
  prompt: string;
  assetNames: string[];
  duration?: number;
}

interface VideoRunResult {
  taskCount: number;
  submittedCount: number;
  successCount: number;
  failedCount: number;
  filePath: string;
  modelId?: string;
}

interface LegacyVideoModel {
  apiUrl?: string;
  apiKey?: string;
  defaults?: Record<string, unknown>;
  limits?: { minDuration?: number; maxDuration?: number; maxReferenceImages?: number };
  concurrency?: { maxParallel?: number; pollIntervalMs?: number; timeoutMs?: number };
}

function safeName(name: string): string {
  const sanitized = path.basename(name);
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('非法的项目名称');
  }
  return sanitized;
}

function relativeProjectPath(projectName: string, filePath: string): string {
  return path.relative(path.join(NOVELS_ROOT, projectName), filePath).split(path.sep).join('/');
}

function parseTrackPrompts(prompts: string): TrackPrompt[] {
  const matches = [...prompts.matchAll(/^##\s+T(\d+)\s+(.+)$/gm)];
  if (matches.length === 0) {
    return [{
      id: 'T01',
      title: '视频任务',
      prompt: prompts.trim(),
      assetNames: [],
    }];
  }

  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? prompts.length;
    const body = prompts
      .slice(start, end)
      .replace(/\n---\s*$/m, '')
      .trim();
    const assetNames = [...body.matchAll(/素材表@图\d+-([^）)\n]+)/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    const duration = Number(body.match(/(\d+(?:\.\d+)?)\s*秒/)?.[1] || 0) || undefined;

    return {
      id: `T${String(match[1] || index + 1).padStart(2, '0')}`,
      title: (match[2] || `视频任务 ${index + 1}`).trim(),
      prompt: body,
      assetNames,
      duration,
    };
  });
}

async function readTasks(manifestPath: string): Promise<VideoTask[]> {
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as VideoTask[];
  } catch {
    return [];
  }
}

async function writeTasks(manifestPath: string, tasks: VideoTask[]): Promise<void> {
  await fs.writeFile(manifestPath, JSON.stringify(tasks, null, 2), 'utf-8');
}

function mergeTasks(existing: VideoTask[], tracks: TrackPrompt[]): VideoTask[] {
  const byId = new Map(existing.map((task) => [task.id, task]));
  return tracks.map((track) => {
    const old = byId.get(track.id);
    return {
      id: track.id,
      title: track.title,
      prompt: track.prompt,
      status: old?.status || 'pending',
      providerTaskId: old?.providerTaskId || null,
      outputPath: old?.outputPath || null,
      modelId: old?.modelId,
      error: old?.error || null,
      createdAt: old?.createdAt || new Date().toISOString(),
      updatedAt: old?.updatedAt,
    };
  });
}

function submitUrlOf(model: ModelConfig): string {
  const legacy = model as ModelConfig & LegacyVideoModel;
  return model.api?.submitUrl || legacy.apiUrl || '';
}

function pollUrlOf(model: ModelConfig, taskId: string): string {
  const pollUrl = model.api?.pollUrl;
  if (pollUrl) return pollUrl.replace('{task_id}', taskId).replace('{id}', taskId);
  return `${submitUrlOf(model).replace(/\/+$/, '')}/${taskId}`;
}

function modelIsExecutable(model: ModelConfig): boolean {
  return Boolean(submitUrlOf(model));
}

async function resolveVideoModel(modelId?: string): Promise<ModelConfig> {
  const configs = (await getModelConfigs()).video.filter((model) => model.enabled !== false);
  const requested = modelId ? configs.find((model) => model.modelId === modelId) : undefined;
  if (requested && modelIsExecutable(requested)) return requested;

  const fallback = configs.find(modelIsExecutable);
  if (fallback) return fallback;

  if (requested) {
    throw new Error(`视频模型 ${requested.modelId} 缺少 submitUrl/apiUrl，无法提交视频任务`);
  }
  throw new Error('未找到可执行的视频模型配置');
}

function resolveApiKey(model: ModelConfig): string {
  const legacy = model as ModelConfig & LegacyVideoModel;
  if (model.api?.apiKey) return model.api.apiKey;
  if (legacy.apiKey) return legacy.apiKey;

  const keyOrEnv = model.api?.apiKeyEnv || '';
  if (!keyOrEnv) return '';

  const envValue = process.env[keyOrEnv];
  if (envValue) return envValue;

  // 兼容旧配置里把真实 key 写在 apiKeyEnv 字段的情况。
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyOrEnv)) return keyOrEnv;
  return '';
}

function modelDefaults(model: ModelConfig): Record<string, unknown> {
  const legacy = model as ModelConfig & LegacyVideoModel;
  return { ...(legacy.defaults || {}), ...(model.defaultParams || {}) };
}

function clampDuration(model: ModelConfig, trackDuration?: number): number {
  const legacy = model as ModelConfig & LegacyVideoModel;
  const defaults = modelDefaults(model);
  const min = legacy.limits?.minDuration || 4;
  const max = legacy.limits?.maxDuration || 15;
  const duration = Number(defaults.duration || trackDuration || 5) || 5;
  return Math.max(min, Math.min(max, duration));
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function fileToDataUrl(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return `data:${mimeFor(filePath)};base64,${buffer.toString('base64')}`;
}

async function resolveReferenceImages(projectName: string, track: TrackPrompt, model: ModelConfig): Promise<string[]> {
  const legacy = model as ModelConfig & LegacyVideoModel;
  const maxRefs = legacy.limits?.maxReferenceImages || 9;
  const assets = await getSeedanceAssets(projectName);
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const refs: string[] = [];

  for (const assetName of track.assetNames) {
    const asset = byName.get(assetName);
    if (!asset?.imagePath) continue;
    const absPath = path.join(NOVELS_ROOT, projectName, asset.imagePath);
    try {
      refs.push(await fileToDataUrl(absPath));
    } catch {
      // Missing reference images should not block text-to-video fallback.
    }
    if (refs.length >= maxRefs) break;
  }

  return refs;
}

function buildVideoBody(model: ModelConfig, track: TrackPrompt, referenceImages: string[]): Record<string, unknown> {
  const defaults = modelDefaults(model);
  const modelName = String(defaults.model || model.modelId);
  const ratio = String(defaults.ratio || defaults.aspectRatio || '16:9');
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: track.prompt }];
  const multiReference = model.mode === 'multiReference' || /seedance[-_]?2|2-0|2\.0/i.test(modelName);

  if (multiReference) {
    for (const image of referenceImages) {
      content.push({
        type: 'image_url',
        image_url: { url: image },
        role: 'reference_image',
      });
    }
  } else {
    if (referenceImages[0]) {
      content.push({
        type: 'image_url',
        image_url: { url: referenceImages[0] },
        role: 'first_frame',
      });
    }
    if (referenceImages[1]) {
      content.push({
        type: 'image_url',
        image_url: { url: referenceImages[1] },
        role: 'last_frame',
      });
    }
  }

  const body: Record<string, unknown> = {
    model: modelName,
    content,
    generate_audio: defaults.generate_audio ?? true,
    ratio,
    duration: clampDuration(model, track.duration),
    watermark: defaults.watermark ?? false,
  };

  const resolution = defaults.resolution;
  if (resolution) body.resolution = resolution;
  return body;
}

function extractTaskId(data: Record<string, unknown>): string {
  const nested = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : {};
  const id = data.id || data.task_id || data.taskId || nested.id || nested.task_id || nested.taskId;
  if (!id) throw new Error('视频任务提交成功但未返回 taskId');
  return String(id);
}

function extractVideoUrl(data: Record<string, unknown>): string | null {
  const nested = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : {};
  const content = data.content && typeof data.content === 'object' ? data.content as Record<string, unknown> : {};
  const nestedContent = nested.content && typeof nested.content === 'object' ? nested.content as Record<string, unknown> : {};
  const results = Array.isArray(nested.results) ? nested.results as Array<Record<string, unknown>> : [];
  return String(
    content.video_url ||
    nestedContent.video_url ||
    data.video_url ||
    nested.video_url ||
    data.result_url ||
    nested.result_url ||
    results[0]?.url ||
    ''
  ) || null;
}

function extractStatus(data: Record<string, unknown>): string {
  const nested = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : {};
  return String(data.status || data.state || nested.status || nested.state || '').toLowerCase();
}

function extractError(data: Record<string, unknown>): string {
  const nested = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : {};
  const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : {};
  return String(error.message || data.message || nested.fail_reason || nested.error || '视频生成失败');
}

async function submitVideoTask(model: ModelConfig, track: TrackPrompt, referenceImages: string[]): Promise<string> {
  const apiKey = resolveApiKey(model);
  if (!apiKey) {
    throw new Error(`视频模型 ${model.modelId} 缺少 API Key`);
  }

  const res = await fetch(submitUrlOf(model), {
    method: model.api?.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, '')}`,
    },
    body: JSON.stringify(buildVideoBody(model, track, referenceImages)),
  });

  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`视频任务提交响应无法解析：${rawText.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`视频任务提交失败 (${res.status}): ${rawText.slice(0, 300)}`);
  }

  return extractTaskId(data);
}

async function pollVideoTask(model: ModelConfig, taskId: string): Promise<string> {
  const apiKey = resolveApiKey(model);
  const legacy = model as ModelConfig & LegacyVideoModel;
  const pollInterval = Math.max(5000, legacy.concurrency?.pollIntervalMs || 10000);
  const timeoutMs = legacy.concurrency?.timeoutMs || 600000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const res = await fetch(pollUrlOf(model, taskId), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, '')}`,
      },
    });

    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(`视频任务轮询响应无法解析：${rawText.slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new Error(`视频任务轮询失败 (${res.status}): ${rawText.slice(0, 300)}`);
    }

    const status = extractStatus(data);
    if (['succeeded', 'success', 'completed'].includes(status)) {
      const videoUrl = extractVideoUrl(data);
      if (!videoUrl) throw new Error('视频任务完成但未返回 video_url');
      return videoUrl;
    }
    if (['failed', 'failure', 'expired', 'cancelled', 'canceled'].includes(status)) {
      throw new Error(extractError(data));
    }
  }

  throw new Error('视频任务轮询超时');
}

async function downloadVideo(videoUrl: string, savePath: string): Promise<void> {
  await fs.mkdir(path.dirname(savePath), { recursive: true });

  if (videoUrl.startsWith('data:')) {
    const match = videoUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error('视频 data URL 格式错误');
    await fs.writeFile(savePath, Buffer.from(match[1], 'base64'));
    return;
  }

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`下载视频失败 (${res.status})`);
  }
  await fs.writeFile(savePath, Buffer.from(await res.arrayBuffer()));
}

export async function prepareSeedanceVideoTasks(
  projectName: string,
  episode: number,
  modelId?: string,
  onProgress?: (message: string) => void
): Promise<VideoRunResult> {
  const safeProject = safeName(projectName);
  const epDir = path.join(NOVELS_ROOT, safeProject, 'seedance', `ep${episode}`);
  const promptsPath = path.join(epDir, '02-prompts.md');
  const prompts = await fs.readFile(promptsPath, 'utf-8');
  if (!prompts.trim()) {
    throw new Error('分镜提示词为空，无法准备视频任务');
  }

  const videoDir = path.join(epDir, 'videos');
  await fs.mkdir(videoDir, { recursive: true });

  const tracks = parseTrackPrompts(prompts);
  const manifestPath = path.join(videoDir, 'video-tasks.json');
  const tasks = mergeTasks(await readTasks(manifestPath), tracks);
  await writeTasks(manifestPath, tasks);

  const model = await resolveVideoModel(modelId);
  let submittedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const track of tracks) {
    const task = tasks.find((item) => item.id === track.id);
    if (!task || task.status === 'success') continue;

    const outputPath = path.join(videoDir, `${track.id}.mp4`);
    try {
      onProgress?.(`${track.id} ${track.title}：准备参考图并提交视频任务...`);
      const refs = await resolveReferenceImages(safeProject, track, model);
      task.status = 'running';
      task.modelId = model.modelId;
      task.error = null;
      task.updatedAt = new Date().toISOString();
      await writeTasks(manifestPath, tasks);

      task.providerTaskId = await submitVideoTask(model, track, refs);
      submittedCount++;
      onProgress?.(`${track.id} ${track.title}：已提交到 ${model.modelId}，等待生成完成...`);
      task.updatedAt = new Date().toISOString();
      await writeTasks(manifestPath, tasks);

      const videoUrl = await pollVideoTask(model, task.providerTaskId);
      await downloadVideo(videoUrl, outputPath);

      task.status = 'success';
      task.outputPath = relativeProjectPath(safeProject, outputPath);
      task.updatedAt = new Date().toISOString();
      successCount++;
      await writeTasks(manifestPath, tasks);
      onProgress?.(`${track.id} ${track.title}：视频已保存为 ${relativeProjectPath(safeProject, outputPath)}`);
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : '视频生成失败';
      task.updatedAt = new Date().toISOString();
      failedCount++;
      await writeTasks(manifestPath, tasks);
      onProgress?.(`${track.id} ${track.title}：失败，${task.error}`);
    }
  }

  return {
    taskCount: tasks.length,
    submittedCount,
    successCount,
    failedCount,
    filePath: relativeProjectPath(safeProject, manifestPath),
    modelId: model.modelId,
  };
}
