import path from 'path';
import { detectPipelineStatus, runDirectorAnalysis, runDirectorPlan, runStoryboardTable, runStoryboardPrompts } from '@/app/lib/novels';
import type { PipelineStatus } from '@/app/lib/novels';
import { callLanguageModel } from '@/app/lib/ai-client';
import { registerBackgroundTask } from '@/app/lib/background-tasks';
import { executeSeedanceFlow } from '@/app/lib/agent/seedance-executor';
import { enforceAccess } from '@/app/lib/server/security/access-control';

export const maxDuration = 300;

interface ChatRequestBody {
  message: string;
  episode: number;
  modelId?: string;
  languageModelId?: string;
  imageModelId?: string;
  videoModelId?: string;
  pipelineStatus?: PipelineStatus;
}

/** 格式化管线状态为文本 */
function formatPipelineStatus(status: PipelineStatus): string {
  const map: { key: keyof PipelineStatus; label: string }[] = [
    { key: 'director', label: 'A 导演分析' },
    { key: 'assets', label: 'B 资产管理' },
    { key: 'directorPlan', label: 'C1 导演规划' },
    { key: 'storyboardTable', label: 'C2 分镜表' },
    { key: 'prompts', label: 'C3 分镜提示词' },
    { key: 'videos', label: 'D 视频生成' },
  ];

  return map
    .map((item) => {
      const val = status[item.key];
      const label =
        val === 'completed' ? '已完成' : val === 'partial' ? '部分完成' : '未开始';
      return `- ${item.label}：${label}`;
    })
    .join('\n');
}

/** 构造 production agent 的 system prompt */
function buildProductionSystemPrompt(status: PipelineStatus, episode: number): string {
  return `你是 Toonflow 制作助手。你负责引导用户完成从剧本到视频的制作流程。

当前正在处理第 ${episode} 集。

当前管线状态：
${formatPipelineStatus(status)}

你可以执行以下操作：
- 当用户要求执行某个阶段时，必须在回复中包含对应的 ACTION 标记来触发执行
- 当用户说"继续"或"下一步"时，根据管线状态判断下一个未完成的阶段，直接输出对应 ACTION 标记触发执行
- 当用户说"都生成吧"或"全部生成"时，按顺序告知用户将执行哪些阶段

各阶段执行方式（用户要求执行时，必须输出对应 ACTION 标记）：
- A 导演分析：输出 [ACTION:DIRECTOR_ANALYSIS]
- B 资产润色+生图：需要用户前往"塑造"Tab 操作
- C1 导演规划：输出 [ACTION:DIRECTOR_PLAN]
- C2 分镜表：输出 [ACTION:STORYBOARD_TABLE]
- C3 分镜提示词：可以执行，输出 [ACTION:STORYBOARD_PROMPTS]
- D 视频任务：输出 [ACTION:VIDEO_TASKS]

重要：当用户明确要求执行某阶段（如"分镜表开始"、"开始C2"、"构建分镜表"等），你必须在回复中包含 ACTION 标记，不要只回复文字描述。

回复时简洁明了，用中文回复。`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const decodedName = path.basename(decodeURIComponent(name));

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: '请求格式错误' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { message, episode, modelId, languageModelId, videoModelId } = body;

  if (!message?.trim()) {
    return new Response(
      JSON.stringify({ error: '消息不能为空' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!episode || isNaN(episode)) {
    return new Response(
      JSON.stringify({ error: '无效的集数' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 获取最新管线状态
    const pipelineStatus = await detectPipelineStatus(decodedName, episode);

    // 构造消息
    const messages = [
      {
        role: 'system',
        content: buildProductionSystemPrompt(pipelineStatus, episode),
      },
      {
        role: 'user',
        content: message,
      },
    ];

    // 非流式调用 — 优先使用 languageModelId，兼容旧的 modelId
    const resolvedLanguageModelId = languageModelId || modelId || '';
    const reply = await callLanguageModel(resolvedLanguageModelId, messages);

    // 检查是否包含 ACTION 标记
    const hasDirectorAction = reply.includes('[ACTION:DIRECTOR_ANALYSIS]');
    const hasDirectorPlanAction = reply.includes('[ACTION:DIRECTOR_PLAN]');
    const hasStoryboardTableAction = reply.includes('[ACTION:STORYBOARD_TABLE]');
    const hasStoryboardPromptsAction = reply.includes('[ACTION:STORYBOARD_PROMPTS]');
    const hasVideoTasksAction = reply.includes('[ACTION:VIDEO_TASKS]');

    // 清理回复中的 ACTION 标记
    const cleanReply = reply.replace(/\[ACTION:DIRECTOR_ANALYSIS\]/g, '').replace(/\[ACTION:DIRECTOR_PLAN\]/g, '').replace(/\[ACTION:STORYBOARD_TABLE\]/g, '').replace(/\[ACTION:STORYBOARD_PROMPTS\]/g, '').replace(/\[ACTION:VIDEO_TASKS\]/g, '').trim();

    // 如果触发了导演分析，fire-and-forget 调用 director API
    let actionResult: { action: string; success?: boolean; assetsCreated?: number; error?: string } | null = null;
    if (hasDirectorAction) {
      try {
        const { assetsCreated } = await runDirectorAnalysis(decodedName, episode, resolvedLanguageModelId || undefined);
        actionResult = { action: 'director_analysis', success: true, assetsCreated };
      } catch (err) {
        actionResult = {
          action: 'director_analysis',
          success: false,
          error: err instanceof Error ? err.message : '导演分析执行失败',
        };
      }
    }

    if (hasDirectorPlanAction) {
      const task = runDirectorPlan(decodedName, episode, resolvedLanguageModelId || undefined).catch(err => {
        console.error('导演规划后台执行失败:', err);
      });
      registerBackgroundTask(`director-plan-${decodedName}-${episode}`, task);
      actionResult = { action: 'director_plan', success: true };
    }

    if (hasStoryboardTableAction) {
      const task = runStoryboardTable(decodedName, episode, resolvedLanguageModelId || undefined).catch(err => {
        console.error('分镜表后台执行失败:', err);
      });
      registerBackgroundTask(`storyboard-table-${decodedName}-${episode}`, task);
      actionResult = { action: 'storyboard_table', success: true };
    }

    if (hasStoryboardPromptsAction) {
      const task = runStoryboardPrompts(decodedName, episode, resolvedLanguageModelId || undefined).catch(err => {
        console.error('分镜提示词后台执行失败:', err);
      });
      registerBackgroundTask(`storyboard-prompts-${decodedName}-${episode}`, task);
      actionResult = { action: 'storyboard_prompts', success: true };
    }

    if (hasVideoTasksAction) {
      try {
        await executeSeedanceFlow(
          () => {},
          {
            projectName: decodedName,
            episode,
            fromStage: 'D',
            toStage: 'D',
            modelId: videoModelId || undefined,
          }
        );
        actionResult = { action: 'video_tasks', success: true };
      } catch (err) {
        actionResult = {
          action: 'video_tasks',
          success: false,
          error: err instanceof Error ? err.message : '视频任务生成失败',
        };
      }
    }

    // 返回结果
    return new Response(
      JSON.stringify({
        reply: cleanReply,
        actionResult,
        pipelineStatus: await detectPipelineStatus(decodedName, episode),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '处理失败，请稍后重试';
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
