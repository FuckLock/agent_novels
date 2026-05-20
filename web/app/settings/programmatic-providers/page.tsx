'use client';

// settings/programmatic-providers — Phase 14 可编程供应商设置页（MVP mock + 默认禁用）
//
// 核心 UI（criteria F1-F4）：
//   - 默认禁用 + MVP mock 提示（F3 — mock / 占位 文案）
//   - 模板列表 + 测试连接按钮 + 能力探测按钮（F2）
//   - amber 警示色 + Card / Button 设计系（F4）

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';

interface ProviderCapability {
  name: string;
  description?: string;
  supported: boolean;
}

interface ProviderModel {
  modelId: string;
  displayName?: string;
  contextWindow?: number;
}

interface TemplateItem {
  id: string;
  templateKey: string;
  providerKind: 'openai-compat' | 'anthropic-compat' | 'custom-http' | 'local';
  displayName: string;
  status: 'draft' | 'probed' | 'verified' | 'disabled';
  capabilities: ProviderCapability[];
  models: ProviderModel[];
  lastProbedAt: number | null;
  lastTestedAt: number | null;
}

interface FeatureState {
  enabled: boolean;
  reason: string;
  mockMode: boolean;
}

function formatTime(ts: number | null) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN');
}

export default function ProgrammaticProvidersPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [featureState, setFeatureState] = useState<FeatureState>({
    enabled: false,
    reason: 'loading',
    mockMode: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/system/programmatic-providers');
      if (res.status === 404) {
        setTemplates([]);
        setFeatureState({
          enabled: false,
          reason: 'API 未启用 — 设置环境变量后重启',
          mockMode: true,
        });
        return;
      }
      if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data.templates || []);
      setFeatureState(data.featureState || { enabled: false, reason: 'unknown', mockMode: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleProbe = async (id: string) => {
    setActionLoading(`probe-${id}`);
    try {
      const res = await fetch(`/api/system/programmatic-providers/${id}/probe`, { method: 'POST' });
      if (!res.ok && res.status !== 404) throw new Error(`能力探测失败 HTTP ${res.status}`);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : '能力探测失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTest = async (id: string) => {
    setActionLoading(`test-${id}`);
    try {
      const res = await fetch(`/api/system/programmatic-providers/${id}/test`, { method: 'POST' });
      if (!res.ok && res.status !== 404) throw new Error(`测试连接失败 HTTP ${res.status}`);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试连接失败');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>可编程供应商模板</h1>

      {/* 默认禁用 + MVP mock 提示（F3 + F2 — amber 警示） */}
      <Card className="mb-4">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: featureState.enabled ? 'var(--tf-warning, #f59e0b)' : 'var(--tf-warning, #f59e0b)',
              marginTop: '8px',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--tf-warning, #f59e0b)' }}>
              {featureState.enabled ? '已启用（MVP mock 模式）' : '增强项 · 默认禁用 · MVP mock 模式'}
            </div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--tf-text-muted)' }}>
              可编程供应商为增强项，默认禁用。即便启用，本 MVP 版本仍为 mock / 占位模式 —
              测试连接 + 能力探测返回示例 placeholder 结果，不会发起任何真实 HTTP / SDK 调用。
              {!featureState.enabled && (
                <span> 如需启用，请设置环境变量 <code>TOONFLOW_PROGRAMMATIC_PROVIDER_ENABLED=true</code> 后重启服务。</span>
              )}
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--tf-text-muted)' }}>{featureState.reason}</div>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="mb-4">
          <div style={{ color: 'var(--tf-danger, #ef4444)' }}>{error}</div>
        </Card>
      )}

      {/* 模板列表 */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontWeight: 600 }}>模板列表（{templates.length}）</div>
          <Button onClick={loadTemplates} disabled={loading}>
            {loading ? '加载中...' : '刷新'}
          </Button>
        </div>
        {templates.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tf-text-muted)' }}>
            {featureState.enabled ? '暂无供应商模板' : '增强项未启用 — 无模板数据'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--tf-border-subtle)' }}>
                <th style={{ textAlign: 'left', padding: '6px' }}>模板</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>类型</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>状态</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>能力数</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>模型数</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>能力探测时间</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>测试连接时间</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--tf-border-subtle)' }}>
                  <td style={{ padding: '6px' }}>
                    <div>{t.displayName}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--tf-text-muted)' }}>{t.templateKey}</div>
                  </td>
                  <td style={{ padding: '6px' }}>{t.providerKind}</td>
                  <td style={{ padding: '6px' }}>{t.status}</td>
                  <td style={{ padding: '6px' }}>{t.capabilities.length}</td>
                  <td style={{ padding: '6px' }}>{t.models.length}</td>
                  <td style={{ padding: '6px' }}>{formatTime(t.lastProbedAt)}</td>
                  <td style={{ padding: '6px' }}>{formatTime(t.lastTestedAt)}</td>
                  <td style={{ padding: '6px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleProbe(t.id)}
                        disabled={actionLoading !== null || !featureState.enabled}
                      >
                        {actionLoading === `probe-${t.id}` ? '探测中...' : '能力探测'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleTest(t.id)}
                        disabled={actionLoading !== null || !featureState.enabled}
                      >
                        {actionLoading === `test-${t.id}` ? '测试中...' : '测试连接'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--tf-bg-raised, #f8f9fa)', borderRadius: '4px', fontSize: '12px', color: 'var(--tf-text-muted)' }}>
          <strong>MVP 注意：</strong> 本页所有"测试连接"和"能力探测"操作均为 placeholder / mock 实现，
          不会发起任何真实网络请求 — 用于展示交互流程，真实集成留待后续 phase。
        </div>
      </Card>
    </div>
  );
}
