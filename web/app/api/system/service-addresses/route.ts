// runtime: nodejs
// API: /api/system/service-addresses
// GET → 返回当前服务地址列表（localhost / lan / private_server 三种访问形态）
//
// 设计（spec L99 + L753 + DEV-PLAN Phase 15）：
//   三种访问形态全覆盖（A3 硬约束）：
//     - localhost  → 本机直连（默认开放，无需凭据）
//     - lan        → 局域网访问（需开启访问凭据；MVP 占位 IP 192.168.x.x）
//     - private_server → 私有服务器（公网必须 HTTPS / 强风险提示）
//
//   enforceAccess 守卫（A4 硬约束 — Phase 3 access-control 集成）：
//     - localhost 自动通过；非 localhost 需 Bearer token
//
//   不重业务（A6 硬约束 — spec L108 + L748）：
//     - 只 import env / security / next；不 import server/* / agent/* / api/*

import os from 'node:os';
import { NextRequest, NextResponse } from 'next/server';
import { enforceAccess } from '../../../lib/server/security/access-control';
import { getServerEnv, type ToonflowAccessMode } from '../../../lib/server/env';

export const runtime = 'nodejs';

interface ServiceAddress {
  mode: ToonflowAccessMode;
  label: string;
  url: string;
  reachable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  notes: string;
  requiresCredential: boolean;
}

interface ServiceAddressesResponse {
  current: ToonflowAccessMode;
  host: string;
  port: number;
  addresses: ServiceAddress[];
  warnings: string[];
}

// LAN IP 探测（MVP 允许占位 — 真实探测使用 os.networkInterfaces）
function detectLanIPs(): string[] {
  try {
    const interfaces = os.networkInterfaces();
    const result: string[] = [];
    for (const name of Object.keys(interfaces)) {
      const list = interfaces[name];
      if (!list) continue;
      for (const item of list) {
        // 只保留 IPv4 + 非 internal + 私有网段（192.168.x.x / 10.x.x.x / 172.16-31.x.x）
        if (item.family !== 'IPv4' || item.internal) continue;
        const ip = item.address;
        if (
          ip.startsWith('192.168.') ||
          ip.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)
        ) {
          result.push(ip);
        }
      }
    }
    return result.length > 0 ? result : ['192.168.x.x'];
  } catch {
    // MVP 降级：占位 IP
    return ['192.168.x.x'];
  }
}

export async function GET(request: NextRequest) {
  const accessError = await enforceAccess(request);
  if (accessError) return accessError;

  try {
    const env = getServerEnv();
    const port = env.port;
    const host = env.host;

    const lanIPs = detectLanIPs();
    const lanUrl = `http://${lanIPs[0]}:${port}`;

    // 三种访问形态全覆盖（A3 硬约束）
    const addresses: ServiceAddress[] = [
      {
        mode: 'localhost',
        label: '本机直连（localhost）',
        url: `http://localhost:${port}`,
        reachable: true,
        riskLevel: 'low',
        notes: '默认开放，本机用户自动以 local-owner 身份访问，无需凭据。',
        requiresCredential: false,
      },
      {
        mode: 'lan',
        label: `局域网访问（LAN，${lanIPs.length} 个网卡）`,
        url: lanUrl,
        reachable: env.accessMode !== 'localhost',
        riskLevel: 'medium',
        notes: '局域网内其它设备访问需要开启访问凭据；建议同时配置 HTTPS 反向代理。',
        requiresCredential: true,
      },
      {
        mode: 'private_server',
        label: '私有服务器（private_server / public）',
        url: env.baseUrl,
        reachable: env.accessMode === 'private_server',
        riskLevel: 'high',
        notes: '公网部署必须使用 HTTPS + 强随机访问凭据；建议增加反向代理与 IP 白名单。',
        requiresCredential: true,
      },
    ];

    const warnings: string[] = [];
    if (env.accessMode !== 'localhost') {
      warnings.push(`当前访问模式：${env.accessMode} — 非 localhost 模式必须配置访问凭据，否则所有 API 将返回 401。`);
    }
    if (env.accessMode === 'private_server') {
      warnings.push('private_server 模式建议公网入口启用 HTTPS / 反向代理，避免明文凭据泄漏。');
    }
    if (lanIPs.includes('192.168.x.x')) {
      warnings.push('未探测到真实 LAN IP（MVP 占位 192.168.x.x）— 请在生产部署确认网卡配置。');
    }

    const response: ServiceAddressesResponse = {
      current: env.accessMode,
      host,
      port,
      addresses,
      warnings,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'service-addresses 查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
