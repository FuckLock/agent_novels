import { SSEEvent } from '@/app/lib/agent/types';
import { fixSeedanceFlow, isSeedanceStage } from '@/app/lib/agent/seedance-executor';

export const maxDuration = 300;

export async function POST(request: Request) {
  let body: {
    projectName?: string;
    episode?: number;
    stage?: unknown;
    feedback?: string;
    modelId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const projectName = typeof body.projectName === 'string' ? body.projectName : '';
  const episode = Number(body.episode);
  if (!projectName || !Number.isInteger(episode) || episode < 1) {
    return Response.json({ error: 'projectName 和 episode 必填' }, { status: 400 });
  }

  const stage = isSeedanceStage(body.stage) ? body.stage : undefined;
  const feedback = typeof body.feedback === 'string' ? body.feedback : undefined;
  const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client closed
        }
      };

      try {
        await fixSeedanceFlow(send, { projectName, episode, stage, feedback, modelId });
      } catch (error) {
        send({ type: 'error', data: error instanceof Error ? error.message : 'Seedance 修复失败' });
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
