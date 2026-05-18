import { SSEEvent } from '@/app/lib/agent/types';
import { classifyIntent } from '@/app/lib/agent/decision';
import { executeChatFlow, buildProjectContext } from '@/app/lib/agent/executor';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const maxDuration = 300; // 5 分钟超时

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  let body: { message: string; modelId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: '请求格式错误' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { message } = body;
  const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
  if (!message?.trim()) {
    return new Response(
      JSON.stringify({ error: '消息不能为空' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // 连接已关闭
        }
      };

      try {
        // 1. 构建项目上下文
        const ctx = await buildProjectContext(decodedName);

        // 2. 意图分类
        const intent = await classifyIntent(message, ctx, modelId);

        // 3. 执行（传递客户端中止信号）
        await executeChatFlow(send, message, intent, ctx, modelId, request.signal);

        // 4. 完成
        send({ type: 'done', data: '' });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : '处理失败，请稍后重试';
        send({ type: 'error', data: errorMsg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
