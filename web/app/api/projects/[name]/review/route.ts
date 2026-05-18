import { NextResponse } from 'next/server';
import {
  getStoryline,
  getProjectConfig,
  getOutline,
  getGlobalSkeleton,
  getEpisodeSkeleton,
  getGlobalAdaptation,
  getEpisodeAdaptation,
  saveReviewResult,
  ReviewResult,
} from '@/app/lib/novels';
import { runAgentSync } from '@/app/lib/agent-runtime';
import { getLatestScriptContent } from '@/app/lib/server/script/script-service';
import { enforceAccess } from '@/app/lib/server/security/access-control';
import { recordQualityGateFromReview } from '@/app/lib/server/quality/quality-gate-service';
import {
  getLatestAdaptationPlan,
  getLatestStoryOutline,
} from '@/app/lib/server/script/text-artifact-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseReviewJson(raw: string): Omit<ReviewResult, 'type' | 'episode' | 'reviewedAt' | 'modelId' | 'status'> {
  // 提取 JSON（可能被 markdown 代码块包裹）
  let jsonStr = raw;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  // 尝试直接找 { ... }
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) jsonStr = braceMatch[0];

  const parsed = JSON.parse(jsonStr);

  return {
    totalScore: Math.round(parsed.totalScore || 0),
    dimensions: (parsed.dimensions || []).map((d: { name: string; weight: number; score: number; comment: string }) => ({
      name: d.name || '',
      weight: Math.round(d.weight || 0),
      score: Math.round(d.score || 0),
      comment: d.comment || '',
    })),
    suggestions: parsed.suggestions || [],
    summary: parsed.summary || '',
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const denied = await enforceAccess(request);
  if (denied) return denied;

  const { name } = await params;
  const body = await request.json();
  const { type, episode, modelId: requestModelId } = body as {
    type: 'skeleton' | 'adaptation' | 'storyline' | 'outline' | 'script';
    scope?: 'global' | 'episode';
    episode?: number;
    modelId?: string;
  };

  if (!type) {
    return NextResponse.json({ error: '缺少 type 参数' }, { status: 400 });
  }

  try {
    // 读取内容
    const storyline = await getStoryline(name) || '';

    let action: 'review_skeleton' | 'review_adaptation' | 'review_storyline' | 'review_outline' | 'review_script';
    let packet: Record<string, unknown> = {};
    if (type === 'skeleton') {
      const scope = body.scope === 'episode' ? 'episode' : 'global';
      if (scope === 'episode' && episode === undefined) {
        return NextResponse.json({ error: '单集骨架审核需要指定 episode' }, { status: 400 });
      }
      const skeleton = scope === 'episode'
        ? (await getLatestStoryOutline(name, 'episode', episode)) || await getEpisodeSkeleton(name, episode as number)
        : (await getLatestStoryOutline(name, 'global')) || await getGlobalSkeleton(name);
      if (!skeleton) {
        return NextResponse.json({ error: '故事骨架为空' }, { status: 400 });
      }
      const config = await getProjectConfig(name);
      const configSummary = config
        ? `集数：${config.totalEpisodes}集，时长：${config.episodeDuration}分钟，范围：第${config.chapterRange?.[0]}-${config.chapterRange?.[1]}章，风格：${config.style}，付费：${config.paywall}`
        : undefined;
      action = 'review_skeleton';
      packet = { skeleton, configSummary };
    } else if (type === 'adaptation') {
      const scope = body.scope === 'episode' ? 'episode' : 'global';
      if (scope === 'episode' && episode === undefined) {
        return NextResponse.json({ error: '单集改编策略审核需要指定 episode' }, { status: 400 });
      }
      const adaptation = scope === 'episode'
        ? (await getLatestAdaptationPlan(name, 'episode', episode)) || await getEpisodeAdaptation(name, episode as number)
        : (await getLatestAdaptationPlan(name, 'global')) || await getGlobalAdaptation(name);
      if (!adaptation) {
        return NextResponse.json({ error: '改编策略为空' }, { status: 400 });
      }
      const skeletonContent = scope === 'episode'
        ? (await getLatestStoryOutline(name, 'episode', episode).catch(() => '')) || await getEpisodeSkeleton(name, episode as number).catch(() => '')
        : (await getLatestStoryOutline(name, 'global').catch(() => '')) || await getGlobalSkeleton(name).catch(() => '');
      action = 'review_adaptation';
      packet = { adaptation, skeletonSummary: skeletonContent || undefined };
    } else if (type === 'storyline') {
      if (!storyline) {
        return NextResponse.json({ error: '故事线为空' }, { status: 400 });
      }
      action = 'review_storyline';
      packet = { storyline };
    } else if (type === 'outline') {
      if (episode === undefined) {
        return NextResponse.json({ error: '大纲审核需要指定 episode' }, { status: 400 });
      }
      const outline = await getOutline(name) as Record<string, unknown>[] | null;
      if (!outline || !outline[episode - 1]) {
        return NextResponse.json({ error: `第 ${episode} 集大纲不存在` }, { status: 400 });
      }
      const episodeData = JSON.stringify(outline[episode - 1], null, 2);
      action = 'review_outline';
      packet = { outlineEpisode: episodeData, storyline, episodeIndex: episode };
    } else if (type === 'script') {
      if (episode === undefined) {
        return NextResponse.json({ error: '剧本审核需要指定 episode' }, { status: 400 });
      }
      const script = await getLatestScriptContent(name, episode);
      if (!script) {
        return NextResponse.json({ error: `第 ${episode} 集剧本不存在` }, { status: 400 });
      }
      const outline = await getOutline(name) as Record<string, unknown>[] | null;
      const outlineEp = outline?.[episode - 1];
      action = 'review_script';
      packet = {
        script,
        outlineEpisode: outlineEp ? JSON.stringify(outlineEp, null, 2) : '无大纲',
        storyline,
        episodeIndex: episode,
      };
    } else {
      return NextResponse.json({ error: '无效的 type' }, { status: 400 });
    }

    const agentResult = await runAgentSync({
      agentName: 'scriptAgent-supervisor',
      packet: {
        projectName: name,
        action,
        ...packet,
        ...(requestModelId ? { modelOverride: requestModelId } : {}),
      },
    });
    const raw = (agentResult.output || agentResult.raw || '').trim();
    if (!raw) {
      return NextResponse.json({ error: '审核 Agent 未返回内容' }, { status: 500 });
    }
    const parsed = parseReviewJson(raw);

    // 构建结果
    const result: ReviewResult = {
      type,
      scope: (type === 'skeleton' || type === 'adaptation') ? (body.scope === 'episode' ? 'episode' : 'global') : undefined,
      episode,
      ...parsed,
      status: parsed.totalScore >= 80 ? 'pass' : 'fail',
      reviewedAt: new Date().toISOString(),
      modelId: requestModelId || 'default-model',
    };

    // 保存
    await saveReviewResult(name, result);
    await recordQualityGateFromReview(name, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('审核失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '审核失败' },
      { status: 500 }
    );
  }
}
