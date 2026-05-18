import { randomUUID } from 'node:crypto';
import { ensureSchema } from '../db/migrate';
import { getSqlite } from '../db/client';

export interface ImpactItem {
  targetType: string;
  label: string;
  status: 'needs_regeneration';
  reason: string;
}

const TEXT_IMPACTS: Array<Omit<ImpactItem, 'reason'>> = [
  { targetType: 'story_outline', label: '故事大纲', status: 'needs_regeneration' },
  { targetType: 'adaptation_plan', label: '改编策略', status: 'needs_regeneration' },
  { targetType: 'script_version', label: '剧本版本', status: 'needs_regeneration' },
  { targetType: 'asset_extraction', label: '资产提取结果', status: 'needs_regeneration' },
];

const SCRIPT_DOWNSTREAM_IMPACTS: Array<Omit<ImpactItem, 'reason'>> = [
  { targetType: 'director_analysis', label: '导演分析', status: 'needs_regeneration' },
  { targetType: 'director_plan', label: '导演规划', status: 'needs_regeneration' },
  { targetType: 'storyboard', label: '分镜表', status: 'needs_regeneration' },
  { targetType: 'prompt_pack', label: '分镜提示词包', status: 'needs_regeneration' },
  { targetType: 'track_plan', label: 'Track 计划', status: 'needs_regeneration' },
  { targetType: 'asset_extraction', label: '资产提取结果', status: 'needs_regeneration' },
];

export function previewTextImpact(reason: string): ImpactItem[] {
  return TEXT_IMPACTS.map((item) => ({ ...item, reason }));
}

function impactsForSource(
  sourceType: 'source_document' | 'chapter' | 'story_outline' | 'adaptation_plan' | 'script_version',
  reason: string,
) {
  if (sourceType === 'script_version') {
    return SCRIPT_DOWNSTREAM_IMPACTS.map((item) => ({ ...item, reason }));
  }
  if (sourceType === 'story_outline') {
    return TEXT_IMPACTS.filter((item) => item.targetType !== 'story_outline').map((item) => ({ ...item, reason }));
  }
  if (sourceType === 'adaptation_plan') {
    return [
      { targetType: 'script_version', label: '剧本版本', status: 'needs_regeneration' as const, reason },
      ...SCRIPT_DOWNSTREAM_IMPACTS.map((item) => ({ ...item, reason })),
    ];
  }
  return previewTextImpact(reason);
}

export async function recordTextImpact(
  projectId: string,
  sourceType: 'source_document' | 'chapter' | 'story_outline' | 'adaptation_plan' | 'script_version',
  sourceId: string,
  reason: string,
) {
  await ensureSchema();
  const now = Date.now();
  const impacts = impactsForSource(sourceType, reason);
  const db = getSqlite();

  db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO dependency_invalidations
        (id, project_id, source_type, source_id, target_type, target_id, status, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'needs_regeneration', ?, ?, ?)`,
    );
    for (const impact of impacts) {
      insert.run(randomUUID(), projectId, sourceType, sourceId, impact.targetType, reason, now, now);
    }
  })();

  return impacts;
}
