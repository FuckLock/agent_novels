'use client';

// settings/story-graph — Phase 14 章节事件图谱设置页（增强项 + 默认禁用 + 可选召回）
//
// 核心 UI（criteria E1-E3）：
//   - 默认禁用提示（E2 — amber 警示 + "增强项" / "可选" 文案）
//   - 3 类字段可见（E3 — 事件 / 角色 / 时序）
//
// 设计系一致性（criteria F4）：var(--tf-*) + Card / Button

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';

interface CharacterRef {
  name: string;
  role?: string;
}

interface RelationEdge {
  from: string;
  to: string;
  type: string;
}

interface TimelineNode {
  sequence?: number;
  chapterIndex?: number;
  note?: string;
}

interface ChapterEventItem {
  id: string;
  chapterId: string;
  projectId: string;
  eventType: 'plot' | 'character' | 'relation' | 'timeline' | 'setting';
  title: string;
  summary: string;
  sequenceIndex: number;
  characters: CharacterRef[];
  relations: RelationEdge[];
  timeline: TimelineNode;
  extractionSource: 'manual' | 'ai_extracted' | 'user_confirmed';
  confidence: number;
  createdAt: number;
}

interface StoryGraphResponse {
  events: ChapterEventItem[];
  characters: CharacterRef[];
  relations: RelationEdge[];
  timeline: TimelineNode[];
  enabled: boolean;
  featureState?: { enabled: boolean; reason: string };
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN');
}

export default function StoryGraphPage() {
  const [graph, setGraph] = useState<StoryGraphResponse>({
    events: [],
    characters: [],
    relations: [],
    timeline: [],
    enabled: false,
  });
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [featureReason, setFeatureReason] = useState('loading');
  const [projectId, setProjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'events' | 'characters' | 'timeline'>('events');

  const loadGraph = useCallback(async () => {
    if (!projectId) {
      setGraph({ events: [], characters: [], relations: [], timeline: [], enabled: false });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('projectId', projectId);
      if (chapterId) params.set('chapterId', chapterId);
      const res = await fetch(`/api/system/story-graph?${params.toString()}`);
      if (res.status === 404) {
        setGraph({ events: [], characters: [], relations: [], timeline: [], enabled: false });
        setFeatureEnabled(false);
        setFeatureReason('API 未启用 — 设置环境变量后重启');
        return;
      }
      if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
      const data: StoryGraphResponse = await res.json();
      setGraph(data);
      setFeatureEnabled(data.enabled || (data.featureState?.enabled ?? false));
      setFeatureReason(data.featureState?.reason || (data.enabled ? 'enabled' : 'disabled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, chapterId]);

  useEffect(() => {
    // 默认查询 feature state
    fetch('/api/system/story-graph?probe=true')
      .then(async (r) => {
        if (r.status === 404) {
          setFeatureEnabled(false);
          setFeatureReason('API 未启用');
          return;
        }
        const data = await r.json();
        setFeatureEnabled(data.enabled || (data.featureState?.enabled ?? false));
        setFeatureReason(data.featureState?.reason || 'unknown');
      })
      .catch(() => {
        setFeatureEnabled(false);
        setFeatureReason('load error');
      });
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>章节事件图谱</h1>

      {/* E2 — 默认禁用提示（amber 警示） */}
      <Card className="mb-4">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: featureEnabled ? 'var(--tf-success, #22c55e)' : 'var(--tf-warning, #f59e0b)',
              marginTop: '8px',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: featureEnabled ? 'var(--tf-text-strong)' : 'var(--tf-warning, #f59e0b)' }}>
              {featureEnabled ? '章节事件图谱已启用' : '增强项 · 默认禁用 · 可选召回'}
            </div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--tf-text-muted)' }}>
              章节事件图谱为增强项（amber 警示），默认禁用 — 剧本 Agent 不强依赖；未启用时主链路不受影响。
              {!featureEnabled && (
                <span> 如需启用，请设置环境变量 <code>TOONFLOW_STORY_GRAPH_ENABLED=true</code> 后重启服务（opt-in）。</span>
              )}
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--tf-text-muted)' }}>{featureReason}</div>
          </div>
        </div>
      </Card>

      {/* 项目筛选 */}
      <Card className="mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>项目 ID</label>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="projects.id..."
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid var(--tf-border-subtle)',
                borderRadius: '4px',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>章节 ID（可选）</label>
            <input
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              placeholder="chapters.id..."
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid var(--tf-border-subtle)',
                borderRadius: '4px',
              }}
            />
          </div>
          <Button onClick={loadGraph} disabled={loading || !projectId}>
            {loading ? '加载中...' : '加载图谱'}
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="mb-4">
          <div style={{ color: 'var(--tf-danger, #ef4444)' }}>{error}</div>
        </Card>
      )}

      {/* E3 — 3 类字段 Tab 切换：事件 / 角色 / 时序 */}
      <Card>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--tf-border-subtle)' }}>
          <button
            onClick={() => setActiveTab('events')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'events' ? '2px solid var(--tf-accent-primary)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'events' ? 600 : 400,
            }}
          >
            事件（{graph.events.length}）
          </button>
          <button
            onClick={() => setActiveTab('characters')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'characters' ? '2px solid var(--tf-accent-primary)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'characters' ? 600 : 400,
            }}
          >
            角色（{graph.characters.length}）
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'timeline' ? '2px solid var(--tf-accent-primary)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'timeline' ? 600 : 400,
            }}
          >
            时序（{graph.timeline.length}）
          </button>
        </div>

        {activeTab === 'events' && (
          <div>
            {graph.events.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tf-text-muted)' }}>
                {featureEnabled ? '暂无事件 — 输入项目 ID 加载或手动写入' : '增强项未启用 — 无事件数据'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--tf-border-subtle)' }}>
                    <th style={{ textAlign: 'left', padding: '6px' }}>序号</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>类型</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>标题</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>来源</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {graph.events.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--tf-border-subtle)' }}>
                      <td style={{ padding: '6px' }}>{ev.sequenceIndex}</td>
                      <td style={{ padding: '6px' }}>{ev.eventType}</td>
                      <td style={{ padding: '6px' }}>{ev.title || '(无标题)'}</td>
                      <td style={{ padding: '6px' }}>{ev.extractionSource}</td>
                      <td style={{ padding: '6px' }}>{formatTime(ev.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'characters' && (
          <div>
            {graph.characters.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tf-text-muted)' }}>
                暂无角色信息
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {graph.characters.map((c, idx) => (
                  <li
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--tf-border-subtle)',
                    }}
                  >
                    <strong>{c.name}</strong>
                    {c.role && <span style={{ marginLeft: '8px', color: 'var(--tf-text-muted)' }}>{c.role}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div>
            {graph.timeline.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tf-text-muted)' }}>
                暂无时序节点（时间线 / sequence）
              </div>
            ) : (
              <ol style={{ paddingLeft: '20px' }}>
                {graph.timeline.map((t, idx) => (
                  <li key={idx} style={{ padding: '4px 0' }}>
                    <span style={{ fontFamily: 'monospace', marginRight: '8px' }}>#{t.sequence ?? idx}</span>
                    {t.chapterIndex !== undefined && <span style={{ marginRight: '8px' }}>章节 {t.chapterIndex}</span>}
                    <span>{t.note || '(无注解)'}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
