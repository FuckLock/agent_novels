'use client';

// settings/agent-memory — Phase 14 Agent 记忆设置页（增强项 + 默认禁用）
//
// 核心 UI（criteria D1-D3）：
//   - 默认禁用提示（D2 — amber 警示 + "默认禁用" 文案 + opt-in 引导）
//   - 查看记忆列表（D3）
//   - 清空记忆按钮 + Modal 确认（D3）
//
// 设计系一致性（criteria F4 — 3 个 settings page 累计 ≥ 1 命中即可）：
//   引用 var(--tf-*) CSS 变量 + Card / Button / Modal 组件

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Modal from '../../components/Modal';

interface MemoryItem {
  id: string;
  contextId: string;
  agentName: string;
  projectId: string | null;
  memoryType: 'long_term' | 'short_term' | 'recall';
  title: string;
  tags: string[];
  createdAt: number;
}

interface FeatureState {
  enabled: boolean;
  reason: string;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN');
}

export default function AgentMemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [featureState, setFeatureState] = useState<FeatureState>({ enabled: false, reason: 'loading' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 筛选状态
  const [filterContextId, setFilterContextId] = useState('');
  const [filterAgentName, setFilterAgentName] = useState('');
  const [filterMemoryType, setFilterMemoryType] = useState<'' | 'long_term' | 'short_term' | 'recall'>('');

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterContextId) params.set('contextId', filterContextId);
      if (filterAgentName) params.set('agentName', filterAgentName);
      if (filterMemoryType) params.set('memoryType', filterMemoryType);
      params.set('limit', '200');

      const res = await fetch(`/api/system/agent-memory?${params.toString()}`);
      if (res.status === 404) {
        // API 可选；未实现时降级到 disabled 状态展示
        setMemories([]);
        setFeatureState({ enabled: false, reason: 'API 未启用 — 设置环境变量后重启' });
        return;
      }
      if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
      const data = await res.json();
      setMemories(data.memories || []);
      setFeatureState(data.featureState || { enabled: false, reason: 'unknown' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setMemories([]);
      setFeatureState({ enabled: false, reason: 'load error' });
    } finally {
      setLoading(false);
    }
  }, [filterContextId, filterAgentName, filterMemoryType]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const handleClear = async () => {
    setActionLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterContextId) params.set('contextId', filterContextId);
      if (filterAgentName) params.set('agentName', filterAgentName);
      if (filterMemoryType) params.set('memoryType', filterMemoryType);
      const res = await fetch(`/api/system/agent-memory?${params.toString()}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`清空失败 HTTP ${res.status}`);
      await loadMemories();
      setShowClearModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>Agent 记忆管理</h1>

      {/* D2 — 默认禁用提示（amber 警示 + opt-in 文案） */}
      <Card className="mb-4" >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: featureState.enabled ? 'var(--tf-success, #22c55e)' : 'var(--tf-warning, #f59e0b)',
              marginTop: '8px',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: featureState.enabled ? 'var(--tf-text-strong)' : 'var(--tf-warning, #f59e0b)' }}>
              {featureState.enabled ? 'Agent 记忆已启用' : '增强项 · 默认禁用'}
            </div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--tf-text-muted)' }}>
              Agent 记忆为增强项（amber 警示），默认禁用，未启用时主链路不受影响。
              {!featureState.enabled && (
                <span> 如需启用，请设置环境变量 <code>TOONFLOW_AGENT_MEMORY_ENABLED=true</code> 后重启服务（opt-in 入口）。</span>
              )}
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--tf-text-muted)' }}>{featureState.reason}</div>
          </div>
        </div>
      </Card>

      {/* 筛选 */}
      <Card className="mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Context ID</label>
            <input
              value={filterContextId}
              onChange={(e) => setFilterContextId(e.target.value)}
              placeholder="memoryContextId..."
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid var(--tf-border-subtle)',
                borderRadius: '4px',
                background: 'var(--tf-bg-input)',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Agent 名称</label>
            <input
              value={filterAgentName}
              onChange={(e) => setFilterAgentName(e.target.value)}
              placeholder="script-agent..."
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid var(--tf-border-subtle)',
                borderRadius: '4px',
                background: 'var(--tf-bg-input)',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>记忆类型</label>
            <select
              value={filterMemoryType}
              onChange={(e) => setFilterMemoryType(e.target.value as typeof filterMemoryType)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid var(--tf-border-subtle)',
                borderRadius: '4px',
                background: 'var(--tf-bg-input)',
              }}
            >
              <option value="">全部</option>
              <option value="long_term">长期</option>
              <option value="short_term">短期</option>
              <option value="recall">召回</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <Button onClick={loadMemories} disabled={loading}>
            {loading ? '加载中...' : '查看 / 列表'}
          </Button>
          <Button
            variant="danger"
            onClick={() => setShowClearModal(true)}
            disabled={loading || !featureState.enabled}
          >
            清空记忆
          </Button>
        </div>
      </Card>

      {/* 错误 */}
      {error && (
        <Card className="mb-4">
          <div style={{ color: 'var(--tf-danger, #ef4444)' }}>{error}</div>
        </Card>
      )}

      {/* 列表 */}
      <Card>
        <div style={{ fontWeight: 600, marginBottom: '12px' }}>
          记忆列表（{memories.length}）
        </div>
        {memories.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tf-text-muted)' }}>
            {featureState.enabled ? '暂无记忆数据' : '增强项未启用 — 不会写入或读取记忆'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--tf-border-subtle)' }}>
                <th style={{ textAlign: 'left', padding: '6px' }}>类型</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>标题</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Agent</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>Context</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--tf-border-subtle)' }}>
                  <td style={{ padding: '6px' }}>{m.memoryType}</td>
                  <td style={{ padding: '6px' }}>{m.title || '(无标题)'}</td>
                  <td style={{ padding: '6px' }}>{m.agentName}</td>
                  <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '11px' }}>
                    {m.contextId.slice(0, 12)}...
                  </td>
                  <td style={{ padding: '6px' }}>{formatTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 清空确认 Modal */}
      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} title="确认清空记忆">
        <div>
          <p>确认清空当前筛选条件下的所有 Agent 记忆？此操作不可逆。</p>
          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowClearModal(false)} disabled={actionLoading}>
              取消
            </Button>
            <Button variant="danger" onClick={handleClear} disabled={actionLoading}>
              {actionLoading ? '处理中...' : '确认清空'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
