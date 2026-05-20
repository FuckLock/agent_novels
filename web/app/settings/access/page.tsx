'use client';

// settings/access — Phase 15 访问设置页
//
// 设计（spec L99 + L100 + L753 + DEV-PLAN Phase 15）：
//   B2 三种访问模式 UI 入口：localhost / lan / private_server 全覆盖
//   B3 非 localhost 风险提示：amber 警示色 + "风险" / "需开启凭据" / "HTTPS" 文案
//   B4 访问凭据展示（MVP 只读列表 — 完整 CRUD 后续 phase 提供）
//   B5 消费 /api/system/service-addresses
//   B6 设计系一致性 — Card / Button / --tf-warning / amber

import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';

type AccessMode = 'localhost' | 'lan' | 'private_server';

interface ServiceAddress {
  mode: AccessMode;
  label: string;
  url: string;
  reachable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  notes: string;
  requiresCredential: boolean;
}

interface ServiceAddressesResponse {
  current: AccessMode;
  host: string;
  port: number;
  addresses: ServiceAddress[];
  warnings: string[];
}

interface CredentialItem {
  id: string;
  label: string;
  accessMode: AccessMode;
  enabled: boolean;
  lastUsedAt: number | null;
}

const MODE_DISPLAY: Record<AccessMode, { name: string; chinese: string }> = {
  localhost: { name: 'localhost', chinese: '本机直连' },
  lan: { name: 'lan', chinese: '局域网（LAN）' },
  private_server: { name: 'private_server', chinese: '私有服务器（反向代理 / 公网）' },
};

function riskBadgeStyle(riskLevel: 'low' | 'medium' | 'high'): React.CSSProperties {
  if (riskLevel === 'high') {
    return {
      background: 'var(--tf-danger-soft, #fee2e2)',
      color: 'var(--tf-danger, #ef4444)',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
    };
  }
  if (riskLevel === 'medium') {
    return {
      background: 'var(--tf-warning-soft, #fef3c7)',
      color: 'var(--tf-warning, #f59e0b)',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
    };
  }
  return {
    background: 'var(--tf-success-soft, #d1fae5)',
    color: 'var(--tf-success, #10b981)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
  };
}

function riskLabel(riskLevel: 'low' | 'medium' | 'high'): string {
  if (riskLevel === 'high') return '高风险';
  if (riskLevel === 'medium') return '中风险';
  return '低风险';
}

function formatTime(ts: number | null): string {
  if (!ts) return '从未使用';
  return new Date(ts).toLocaleString('zh-CN');
}

export default function AccessSettingsPage() {
  const [data, setData] = useState<ServiceAddressesResponse | null>(null);
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/system/service-addresses');
      if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
      const json = (await res.json()) as ServiceAddressesResponse;
      setData(json);
      // 凭据展示（MVP 只读 — 占位空列表 + 提示）
      setCredentials([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const isNonLocalhost = data && data.current !== 'localhost';

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>访问设置</h1>
      <p style={{ fontSize: '13px', color: 'var(--tf-text-muted, #6b7280)', marginBottom: '24px' }}>
        管理服务访问形态、访问凭据与公网风险提示。当前模式：
        <code style={{ marginLeft: '4px', padding: '2px 6px', background: 'var(--tf-bg-subtle, #f3f4f6)', borderRadius: '3px' }}>
          {data ? data.current : '...'}
        </code>
      </p>

      {error && (
        <Card className="mb-4">
          <div style={{ color: 'var(--tf-danger, #ef4444)' }}>{error}</div>
        </Card>
      )}

      {/* B3 非 localhost 风险提示 — amber 警示色 */}
      {isNonLocalhost && data && (
        <Card className="mb-4">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--tf-warning, #f59e0b)',
                marginTop: '8px',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--tf-warning, #f59e0b)' }}>
                警示 · 非 localhost 访问风险
              </div>
              <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--tf-text-muted, #6b7280)' }}>
                当前模式为 <strong>{data.current}</strong>，所有非本机访问必须开启访问凭据（access_credentials）。
                公网部署强烈建议启用 HTTPS + 反向代理 + IP 白名单，避免明文凭据泄漏。
              </div>
              {data.warnings.length > 0 && (
                <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '12px', color: 'var(--tf-text-muted, #6b7280)' }}>
                  {data.warnings.map((w, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* B2 三种访问模式 UI 入口 */}
      <Card className="mb-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontWeight: 600 }}>访问地址（三种形态全覆盖）</div>
          <Button onClick={loadAddresses} disabled={loading}>
            {loading ? '加载中...' : '刷新'}
          </Button>
        </div>
        {!data ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tf-text-muted, #6b7280)' }}>
            {loading ? '加载中...' : '暂无数据'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.addresses.map((addr) => {
              const isCurrent = addr.mode === data.current;
              const display = MODE_DISPLAY[addr.mode];
              return (
                <div
                  key={addr.mode}
                  style={{
                    padding: '12px',
                    border: `1px solid ${isCurrent ? 'var(--tf-primary, #7c3aed)' : 'var(--tf-border-subtle, #e5e7eb)'}`,
                    borderRadius: '6px',
                    background: isCurrent ? 'var(--tf-primary-soft, #f3f0ff)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '14px' }}>{display.chinese}</strong>
                    <code style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--tf-bg-subtle, #f3f4f6)', borderRadius: '3px' }}>
                      {display.name}
                    </code>
                    <span style={riskBadgeStyle(addr.riskLevel)}>{riskLabel(addr.riskLevel)}</span>
                    {isCurrent && (
                      <span style={{ ...riskBadgeStyle('low'), background: 'var(--tf-primary-soft, #f3f0ff)', color: 'var(--tf-primary, #7c3aed)' }}>
                        当前
                      </span>
                    )}
                    {addr.requiresCredential && (
                      <span style={{ ...riskBadgeStyle('medium'), background: 'var(--tf-warning-soft, #fef3c7)', color: 'var(--tf-warning, #f59e0b)' }}>
                        需访问凭据
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--tf-text-muted, #6b7280)', marginBottom: '4px' }}>
                    {addr.url}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--tf-text-muted, #6b7280)' }}>{addr.notes}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* B4 访问凭据展示（MVP 只读 — access_credentials 表内容） */}
      <Card className="mb-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontWeight: 600 }}>访问凭据（access_credentials）</div>
          <span style={{ fontSize: '12px', color: 'var(--tf-text-muted, #6b7280)' }}>MVP 只读列表</span>
        </div>
        {credentials.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--tf-text-muted, #6b7280)', fontSize: '13px' }}>
            暂无访问凭据 · 非 localhost 访问需先创建 token（CLI 或后续 phase 提供 UI）
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--tf-border-subtle, #e5e7eb)' }}>
                <th style={{ textAlign: 'left', padding: '6px' }}>标签</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>访问模式</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>状态</th>
                <th style={{ textAlign: 'left', padding: '6px' }}>最近使用</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((cred) => (
                <tr key={cred.id} style={{ borderBottom: '1px solid var(--tf-border-subtle, #e5e7eb)' }}>
                  <td style={{ padding: '6px' }}>{cred.label}</td>
                  <td style={{ padding: '6px' }}>{MODE_DISPLAY[cred.accessMode].chinese}</td>
                  <td style={{ padding: '6px' }}>{cred.enabled ? '启用' : '禁用'}</td>
                  <td style={{ padding: '6px' }}>{formatTime(cred.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>HTTP Web 浏览器直连说明</div>
        <div style={{ fontSize: '13px', color: 'var(--tf-text-muted, #6b7280)', lineHeight: 1.6 }}>
          Toonflow 是<strong>HTTP Web 优先</strong>架构（spec L98 + L662 + L748）—
          Electron 桌面壳只是封装同一份 Web 服务，所有 API 浏览器直连 <code>http://{data?.host || 'localhost'}:{data?.port || 3456}/api/*</code> 完全等价。
          桌面壳启动失败时，可在浏览器直接访问 localhost 入口继续操作；非桌面运行环境（如远程开发机）也可通过 lan / private_server 模式访问。
        </div>
      </Card>
    </div>
  );
}
