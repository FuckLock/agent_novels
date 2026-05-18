/**
 * AI 调用统一封装
 * - 语言模型：复用 stream-model.ts 的 resolveModel / callModel / callModelStream
 * - 图片模型：提交任务 -> 轮询结果 -> 下载图片
 */

import { resolveModel, callModel, callModelStream } from '@/app/lib/agent/stream-model';
import { getModelConfigs, ModelConfig } from '@/app/lib/novels';

// ============ 语言模型 ============

/** 获取指定类型的模型列表 */
export async function getModels(type: 'language' | 'image' | 'video'): Promise<ModelConfig[]> {
  const configs = await getModelConfigs();
  return configs[type] || [];
}

/** 获取指定 modelId 的模型配置，可指定类型避免跨类型同名误取 */
export async function getModelById(
  modelId: string,
  type?: 'language' | 'image' | 'video'
): Promise<ModelConfig | null> {
  const configs = await getModelConfigs();
  if (type) {
    return (configs[type] || []).find(m => m.modelId === modelId) ?? null;
  }
  const all = [...configs.language, ...configs.image, ...configs.video];
  return all.find(m => m.modelId === modelId) ?? null;
}

/** 非流式调用语言模型（用于润色等短任务） */
export async function callLanguageModel(
  modelId: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const model = await resolveModel('chat', modelId);
  return callModel(model, messages);
}

/** 流式调用语言模型（用于 Agent 对话） */
export async function* streamLanguageModel(
  modelId: string,
  messages: { role: string; content: string }[]
): AsyncGenerator<string> {
  const model = await resolveModel('chat', modelId);
  yield* callModelStream(model, messages);
}

// ============ 图片模型 ============

/** 图片任务结果 */
export interface ImageTaskResult {
  taskId: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  imageUrl?: string;
  error?: string;
}

export interface ImageGenerateOptions {
  size?: string;
  aspectRatio?: string;
  urls?: string[];
  onTaskId?: (taskId: string) => void | Promise<void>;
}

type ImageAdapter = NonNullable<ModelConfig['adapter']>;

function getApiKey(model: ModelConfig): string {
  if (model.api.apiKey) return model.api.apiKey;
  if (!model.api.apiKeyEnv) return '';
  return process.env[model.api.apiKeyEnv] || model.api.apiKeyEnv;
}

function inferImageAdapter(model: ModelConfig): ImageAdapter {
  if (model.adapter === 'openai-images' || model.adapter === 'grsai-task-polling' || model.adapter === 'custom-http') {
    return model.adapter;
  }
  if (model.provider === 'openai' || model.api.baseUrl?.includes('openai.com')) return 'openai-images';
  if (model.api.submitUrl && model.api.pollUrl) return 'grsai-task-polling';
  return 'custom-http';
}

function parseJsonOrSSE(rawText: string): Record<string, unknown> {
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const matches = Array.from(rawText.matchAll(/^data:\s*(.+)$/gm))
      .map((match) => match[1].trim())
      .filter((line) => line && line !== '[DONE]');
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(matches[i]) as Record<string, unknown>;
      } catch {
        // try earlier event
      }
    }
    throw new Error(`无法解析图片接口响应: ${rawText.slice(0, 200)}`);
  }
}

function getNestedObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getTaskId(data: Record<string, unknown>): string {
  const nested = getNestedObject(data.data);
  const taskId = data.taskId || data.id || data.task_id || nested?.taskId || nested?.id || nested?.task_id;
  return typeof taskId === 'string' ? taskId : '';
}

function getSizeParam(model: ModelConfig): 'size' | 'imageSize' | null {
  const configured = model.capabilities?.sizeParam;
  if (configured === 'size' || configured === 'imageSize') return configured;
  if (configured === null) return null;
  if (model.defaultParams?.imageSize) return 'imageSize';
  if (model.defaultParams?.size) {
    const submitUrl = model.api.submitUrl || '';
    return submitUrl.includes('/nano-banana') ? 'imageSize' : 'size';
  }
  return null;
}

function mapAspectRatioToOpenAISize(aspectRatio?: string): string {
  if (aspectRatio === '1:1') return '1024x1024';
  if (aspectRatio === '16:9' || aspectRatio === '3:2' || aspectRatio === '4:3' || aspectRatio === '21:9') return '1536x1024';
  if (aspectRatio === '9:16' || aspectRatio === '2:3' || aspectRatio === '3:4' || aspectRatio === '9:21') return '1024x1536';
  return '1024x1024';
}

function getImageMimeType(format: unknown): string {
  if (format === 'jpeg' || format === 'jpg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

/** 统一图片生成入口：按 adapter 分发官方 OpenAI / 第三方任务轮询 */
export async function generateImage(
  model: ModelConfig,
  prompt: string,
  options: ImageGenerateOptions = {}
): Promise<ImageTaskResult> {
  const adapter = inferImageAdapter(model);
  if (adapter === 'openai-images') {
    return generateOpenAIImage(model, prompt, options);
  }
  if (adapter === 'grsai-task-polling') {
    const taskId = await submitImageTask(model, prompt, options);
    await options.onTaskId?.(taskId);
    return pollImageTask(model, taskId);
  }
  throw new Error(`不支持的图像模型适配器：${adapter}`);
}

async function generateOpenAIImage(
  model: ModelConfig,
  prompt: string,
  options: ImageGenerateOptions
): Promise<ImageTaskResult> {
  const baseUrl = (model.api.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = getApiKey(model);
  if (!apiKey) {
    throw new Error(`模型 ${model.modelId} 未配置 API Key`);
  }

  const defaultParams = model.defaultParams || {};
  const requestedSize = options.size && ['auto', '1024x1024', '1536x1024', '1024x1536'].includes(options.size)
    ? options.size
    : mapAspectRatioToOpenAISize(options.aspectRatio || (defaultParams.aspectRatio as string | undefined));
  const body = {
    ...defaultParams,
    model: (defaultParams.model as string) || model.modelId,
    prompt,
    size: requestedSize,
  };

  delete (body as Record<string, unknown>).aspectRatio;

  const res = await fetch(`${baseUrl}/images/generations`, {
    method: model.api.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI 图片生成失败 (${res.status}): ${rawText.slice(0, 200)}`);
  }

  const data = parseJsonOrSSE(rawText);
  const items = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
  const first = items[0] || {};
  const b64 = typeof first.b64_json === 'string' ? first.b64_json : '';
  const url = typeof first.url === 'string' ? first.url : '';
  const outputFormat = first.output_format || defaultParams.output_format || 'png';

  if (b64) {
    return {
      taskId: `openai-direct-${Date.now()}`,
      status: 'success',
      imageUrl: `data:${getImageMimeType(outputFormat)};base64,${b64}`,
    };
  }
  if (url) {
    return {
      taskId: `openai-direct-${Date.now()}`,
      status: 'success',
      imageUrl: url,
    };
  }

  return {
    taskId: `openai-direct-${Date.now()}`,
    status: 'failed',
    error: 'OpenAI 图片生成成功但未返回图片数据',
  };
}

/** 提交图片生成任务，返回 taskId */
export async function submitImageTask(
  model: ModelConfig,
  prompt: string,
  options: ImageGenerateOptions = {}
): Promise<string> {
  const submitUrl = model.api.submitUrl;
  if (!submitUrl) {
    throw new Error(`模型 ${model.modelId} 未配置 submitUrl`);
  }

  const apiKey = getApiKey(model);
  const defaultParams = model.defaultParams || {};
  const sizeParam = getSizeParam(model);
  const body: Record<string, unknown> = {
    ...defaultParams,
    model: (defaultParams.model as string) || model.modelId,
    prompt,
    aspectRatio: options.aspectRatio || (defaultParams.aspectRatio as string) || '1:1',
  };

  if (model.provider === 'grsai' || inferImageAdapter(model) === 'grsai-task-polling') {
    body.webHook = body.webHook || '-1';
    body.shutProgress = typeof body.shutProgress === 'boolean' ? body.shutProgress : false;
  }

  if (options.urls?.length && model.capabilities?.supportsReferenceImages !== false) {
    body.urls = options.urls;
  } else {
    delete body.urls;
  }

  if (options.size && sizeParam) {
    body[sizeParam] = options.size;
    if (sizeParam === 'imageSize') delete body.size;
    if (sizeParam === 'size') delete body.imageSize;
  } else if (sizeParam === 'imageSize' && defaultParams.size && !defaultParams.imageSize) {
    body.imageSize = defaultParams.size;
    delete body.size;
  } else if (!sizeParam) {
    delete body.size;
    delete body.imageSize;
  }

  const res = await fetch(submitUrl, {
    method: model.api.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`图片任务提交失败 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const rawText = await res.text();
  const data = parseJsonOrSSE(rawText);
  const taskId = getTaskId(data);
  if (!taskId) {
    throw new Error('图片任务提交成功但未返回 taskId');
  }
  return taskId;
}

/** 轮询图片生成结果 */
export async function pollImageTask(
  model: ModelConfig,
  taskId: string,
  maxRetries = 60,
  intervalMs = 5000
): Promise<ImageTaskResult> {
  const pollUrl = model.api.pollUrl;
  if (!pollUrl) {
    throw new Error(`模型 ${model.modelId} 未配置 pollUrl`);
  }

  const apiKey = model.api.apiKey || '';

  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(pollUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ id: taskId }),
    });

    if (!res.ok) {
      throw new Error(`轮询失败 (${res.status})`);
    }

    const rawPollText = await res.text();
    let data = parseJsonOrSSE(rawPollText);
    const responseCode = typeof data.code === 'number' ? data.code : null;
    const responseMsg = (data.msg || data.message || data.error) as string | undefined;

    if (responseCode === -22) {
      return { taskId, status: 'failed', error: '任务不存在或已过期' };
    }

    // 展开嵌套响应：{code, data: {status, results, ...}, msg} → 取内层 data
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      data = data.data as Record<string, unknown>;
    }

    if (responseCode !== null && responseCode !== 0 && !data.status && !data.state) {
      return { taskId, status: 'failed', error: responseMsg || `接口返回错误码 ${responseCode}` };
    }

    // 成功
    if (data.status === 'succeeded' || data.status === 'success' || data.state === 'completed') {
      const results = Array.isArray(data.results) ? data.results as Array<Record<string, unknown>> : [];
      return {
        taskId,
        status: 'success',
        imageUrl: (results[0]?.url || data.url || data.imageUrl || data.image_url) as string | undefined,
      };
    }

    // 失败
    if (data.status === 'failed' || data.state === 'failed') {
      return {
        taskId,
        status: 'failed',
        error: (data.failure_reason || data.error || data.message || responseMsg || '生成失败') as string,
      };
    }

    // 等待后重试
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return { taskId, status: 'failed', error: '轮询超时' };
}

/** 下载图片到本地（含 1 次重试） */
export async function downloadImage(
  imageUrl: string,
  savePath: string
): Promise<void> {
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error('无法解析 base64 图片数据');
    const fsModule = await import('fs/promises');
    const pathModule = await import('path');
    await fsModule.mkdir(pathModule.dirname(savePath), { recursive: true });
    await fsModule.writeFile(savePath, Buffer.from(match[1], 'base64'));
    return;
  }

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(imageUrl);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const fsModule = await import('fs/promises');
      const pathModule = await import('path');
      await fsModule.mkdir(pathModule.dirname(savePath), { recursive: true });
      await fsModule.writeFile(savePath, buffer);
      return;
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
    } else {
      throw new Error(`下载图片失败 (${res.status})`);
    }
  }
}
