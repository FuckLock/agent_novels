import { NextResponse } from 'next/server';
import { getModelConfigsForServer } from '@/app/lib/server/models/model-registry';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { type, id } = await params;

  try {
    const configs = await getModelConfigsForServer();
    const list = configs[type as keyof typeof configs] as Array<{
      modelId: string;
      provider?: string;
      adapter?: string;
      api?: { baseUrl?: string; submitUrl?: string; pollUrl?: string; apiKey?: string; protocol?: string; version?: string };
      defaultParams?: Record<string, unknown>;
    }> | undefined;
    const config = list?.find((m) => m.modelId === id);

    if (!config) {
      return NextResponse.json({ success: false, error: '模型配置不存在' }, { status: 404 });
    }

    // 语言模型（OpenAI 兼容接口）
    if (type === 'language') {
      const baseUrl = config.api?.baseUrl?.replace(/\/+$/, '');
      const apiKey = config.api?.apiKey;

      if (!baseUrl || !apiKey) {
        return NextResponse.json({ success: false, error: '缺少 API Base URL 或 API Key' }, { status: 400 });
      }

      const protocol = String(config.api?.protocol || '').toLowerCase();
      const provider = String(config.provider || '').toLowerCase();
      const isAnthropic = protocol === 'anthropic' || provider === 'anthropic' || provider === 'claude' || /anthropic\.com/.test(baseUrl);

      if (isAnthropic) {
        const messagesUrl = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;
        const res = await fetch(messagesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': config.api?.version || '2023-06-01',
          },
          body: JSON.stringify({
            model: config.modelId,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          return NextResponse.json({ success: true, message: '连接成功' });
        }

        const status = res.status;
        const text = await res.text().catch(() => '');
        if (status === 401 || status === 403) {
          return NextResponse.json({ success: false, error: 'API Key 无效或已过期' }, { status: 200 });
        }
        if (status === 429) {
          return NextResponse.json({ success: true, warn: true, message: '配置正确，服务暂时繁忙（429）' }, { status: 200 });
        }
        return NextResponse.json(
          { success: false, error: `API 返回 ${status}${text ? ': ' + text.slice(0, 200) : ''}` },
          { status: 200 }
        );
      }

      const defaultParams = config.defaultParams || {};
      const testModel = (defaultParams.model as string) || config.modelId;

      // 优先用 /models 接口测试连通性（轻量，不消耗 tokens）
      const modelsUrl = baseUrl.endsWith('/models') ? baseUrl : `${baseUrl}/models`;
      const modelsRes = await fetch(modelsUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);

      if (modelsRes && modelsRes.ok) {
        return NextResponse.json({ success: true, message: '连接成功' });
      }

      // /models 不可用时，退回 chat completions 测试
      const chatUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...defaultParams,
          model: testModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return NextResponse.json({ success: true, message: '连接成功' });
      }

      const status = res.status;
      const text = await res.text().catch(() => '');

      // 401/403：认证失败
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { success: false, error: 'API Key 无效或已过期' },
          { status: 200 }
        );
      }

      // 429：限流/过载 — 说明认证通过了，配置是对的
      if (status === 429) {
        return NextResponse.json(
          { success: true, warn: true, message: '配置正确，服务暂时繁忙（429）' },
          { status: 200 }
        );
      }

      // 其他错误
      return NextResponse.json(
        { success: false, error: `API 返回 ${status}${text ? ': ' + text.slice(0, 200) : ''}` },
        { status: 200 }
      );
    }

    if (type === 'image') {
      const adapter = config.adapter || (config.provider === 'openai' ? 'openai-images' : 'grsai-task-polling');
      const apiKey = config.api?.apiKey;

      if (adapter === 'openai-images') {
        if (!config.api?.baseUrl || !apiKey) {
          return NextResponse.json({ success: false, error: '缺少 API Base URL 或 API Key' }, { status: 400 });
        }
        return NextResponse.json({
          success: true,
          warn: true,
          message: '配置格式已通过，需发起一次生成验证',
        });
      }

      if (adapter === 'grsai-task-polling') {
        if (!config.api?.submitUrl || !config.api?.pollUrl || !apiKey) {
          return NextResponse.json({ success: false, error: '缺少 Submit URL、Poll URL 或 API Key' }, { status: 400 });
        }
        return NextResponse.json({
          success: true,
          warn: true,
          message: '配置格式已通过，需发起一次生成验证',
        });
      }

      return NextResponse.json({ success: false, error: `不支持的图像模型适配器：${adapter}` }, { status: 200 });
    }

    // 媒体模型（视频/图像）：检查 submitUrl 是否可达
    const mediaConfig = config as { api?: { submitUrl?: string; apiKey?: string } };
    const submitUrl = mediaConfig.api?.submitUrl;
    if (!submitUrl) {
      return NextResponse.json({ success: false, error: '缺少 Submit URL' }, { status: 400 });
    }

    // 仅做 HEAD/GET 探测，不实际提交任务
    const probeRes = await fetch(submitUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (probeRes && probeRes.status < 500) {
      return NextResponse.json({ success: true, message: '接口可达' });
    }

    return NextResponse.json(
      { success: false, error: probeRes ? `接口返回 ${probeRes.status}` : '无法连接到接口' },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ success: false, error: msg }, { status: 200 });
  }
}
