import { getModelConfigs, ModelConfig } from '@/app/lib/novels';

/** 某些模型对 temperature 有限制，需根据 provider/defaultParams 适配 */
const FIXED_TEMPERATURE_PROVIDERS = new Set(['kimi', 'moonshot']);

function resolveTemperature(model: ModelConfig, fallback: number): number {
  // 优先使用模型配置中的 defaultParams
  if (model.defaultParams?.temperature !== undefined) {
    return model.defaultParams.temperature as number;
  }
  // kimi/moonshot 系列只允许 temperature=1
  if (model.provider && FIXED_TEMPERATURE_PROVIDERS.has(model.provider.toLowerCase())) {
    return 1;
  }
  return fallback;
}

/** 获取当前要使用的语言模型配置 */
export async function resolveModel(_stage: string, overrideModelId?: string): Promise<ModelConfig> {
  const configs = await getModelConfigs();

  // 如果指定了 overrideModelId，直接在语言模型列表中查找
  if (overrideModelId) {
    const model = configs.language.find((m) => m.modelId === overrideModelId);
    if (!model) throw new Error(`模型 ${overrideModelId} 未找到`);
    if (!model.enabled) throw new Error(`模型 ${overrideModelId} 未启用`);
    return model;
  }

  const enabledModels = configs.language.filter((m) => m.enabled !== false);
  const model = enabledModels.find((m) => m.isDefault) || enabledModels[0];
  if (!model) throw new Error('未配置可用语言模型，请在设置页面添加或启用模型');
  return model;
}

function resolveApiKey(model: ModelConfig): string {
  if (model.api.apiKey) return model.api.apiKey;
  if (model.api.apiKeyEnv) return process.env[model.api.apiKeyEnv] || '';
  return '';
}

function resolveProvider(model: ModelConfig): string {
  return (model.provider || '').toLowerCase();
}

function resolveApiProtocol(model: ModelConfig): 'anthropic' | 'openai-compatible' {
  const protocol = String(model.api.protocol || '').toLowerCase();
  const provider = resolveProvider(model);
  const baseUrl = model.api.baseUrl || '';
  if (protocol === 'anthropic' || provider === 'anthropic' || provider === 'claude' || /anthropic\.com/.test(baseUrl)) {
    return 'anthropic';
  }
  return 'openai-compatible';
}

function buildOpenAICompatibleBody(
  model: ModelConfig,
  messages: { role: string; content: string }[],
  stream: boolean
): Record<string, unknown> {
  const defaultParams = model.defaultParams || {};
  return {
    ...defaultParams,
    model: (defaultParams.model as string) || model.modelId,
    messages,
    temperature: resolveTemperature(model, 0.7),
    stream,
  };
}

/** 解析 API 错误响应为友好消息 */
function friendlyErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return 'API Key 无效或已过期，请检查设置';
  }
  if (status === 429) {
    return '模型服务暂时繁忙，请稍后重试';
  }
  // 尝试从 JSON 中提取 message 字段，避免暴露原始 JSON
  try {
    const json = JSON.parse(body);
    const msg = json?.error?.message || json?.message || json?.error;
    if (typeof msg === 'string') return `模型调用失败 (${status}): ${msg}`;
  } catch {
    // 非 JSON，使用截断的原始文本
  }
  const short = body.length > 200 ? body.slice(0, 200) + '...' : body;
  return `模型调用失败 (${status}): ${short}`;
}

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 流式调用语言模型 — OpenAI 兼容 API */
async function* streamOpenAICompatible(
  model: ModelConfig,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const baseUrl = model.api.baseUrl?.replace(/\/$/, '') || '';
  const apiKey = resolveApiKey(model);
  const maxRetries = 2; // 429 时最多重试 2 次
  let lastErrorMsg = '';

  if (!baseUrl) throw new Error(`模型 ${model.modelId} 未配置 API Base URL`);
  if (!apiKey) throw new Error(`模型 ${model.modelId} 未配置 API Key`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('已中止');
    const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildOpenAICompatibleBody(model, messages, true)),
      signal,
    });

    if (response.ok) {
      // 成功，跳出重试循环进入流式读取
      yield* readSSEStream(response);
      return;
    }

    const errBody = await response.text();

    // 401/403 不重试，直接报错
    if (response.status === 401 || response.status === 403) {
      throw new Error(friendlyErrorMessage(response.status, errBody));
    }

    // 429 重试
    if (response.status === 429 && attempt < maxRetries) {
      lastErrorMsg = friendlyErrorMessage(response.status, errBody);
      await sleep(2000 + attempt * 1000); // 2s, 3s
      continue;
    }

    // 其他错误或 429 重试耗尽
    throw new Error(friendlyErrorMessage(response.status, errBody));
  }

  // 理论上不会到这里，但以防万一
  throw new Error(lastErrorMsg || '模型服务暂时繁忙，请稍后重试');
}

function toAnthropicMessages(messages: { role: string; content: string }[]): {
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .filter(Boolean)
    .join('\n\n');

  const converted: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const previous = converted[converted.length - 1];
    if (previous?.role === role) {
      previous.content += `\n\n${message.content}`;
    } else {
      converted.push({ role, content: message.content });
    }
  }

  if (converted.length === 0) {
    converted.push({ role: 'user', content: 'Continue.' });
  }

  return { system: system || undefined, messages: converted };
}

/** 流式调用语言模型 — Anthropic Messages API */
async function* streamAnthropic(
  model: ModelConfig,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const baseUrl = model.api.baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com/v1';
  const apiKey = resolveApiKey(model);
  const maxRetries = 2;
  let lastErrorMsg = '';

  if (!apiKey) throw new Error(`模型 ${model.modelId} 未配置 API Key`);

  const prepared = toAnthropicMessages(messages);
  const maxTokens =
    (model.defaultParams?.max_tokens as number | undefined) ||
    (model.defaultParams?.maxTokens as number | undefined) ||
    4096;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('已中止');
    const url = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': String(model.api.version || model.defaultParams?.anthropicVersion || '2023-06-01'),
      },
      body: JSON.stringify({
        model: (model.defaultParams?.model as string) || model.modelId,
        system: prepared.system,
        messages: prepared.messages,
        max_tokens: maxTokens,
        temperature: resolveTemperature(model, 0.7),
        stream: true,
      }),
      signal,
    });

    if (response.ok) {
      yield* readSSEStream(response, 'anthropic');
      return;
    }

    const errBody = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(friendlyErrorMessage(response.status, errBody));
    }
    if (response.status === 429 && attempt < maxRetries) {
      lastErrorMsg = friendlyErrorMessage(response.status, errBody);
      await sleep(2000 + attempt * 1000);
      continue;
    }
    throw new Error(friendlyErrorMessage(response.status, errBody));
  }

  throw new Error(lastErrorMsg || '模型服务暂时繁忙，请稍后重试');
}

/** 读取 SSE 流并 yield 内容 */
async function* readSSEStream(
  response: Response,
  protocol: 'openai-compatible' | 'anthropic' = 'openai-compatible'
): AsyncGenerator<string> {

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;

      try {
        const json = JSON.parse(payload);
        const content = protocol === 'anthropic'
          ? json.type === 'content_block_delta' && json.delta?.type === 'text_delta'
            ? json.delta.text
            : undefined
          : json.choices?.[0]?.delta?.content;
        if (json.type === 'error' && json.error?.message) {
          throw new Error(json.error.message);
        }
        if (content) yield content;
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        if (error instanceof Error && error.message) throw error;
      }
    }
  }
}

/** 非流式调用（用于意图分类等短请求） */
export async function callModel(
  model: ModelConfig,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): Promise<string> {
  let result = '';
  for await (const chunk of callModelStream(model, messages, signal)) {
    result += chunk;
  }
  return result;
}

/** 流式调用入口 */
export async function* callModelStream(
  model: ModelConfig,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (resolveApiProtocol(model) === 'anthropic') {
    yield* streamAnthropic(model, messages, signal);
    return;
  }
  yield* streamOpenAICompatible(model, messages, signal);
}
