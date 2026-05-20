# Toonflow 端到端验收清单（E2E Acceptance）

> **核心闭环 10 步**（spec L8-13 + L21 RoughCut 6 项硬指标 + DEV-PLAN L644 派发硬约束）
>
> 本文档对应 Phase 15 验收：把 Toonflow 的 6 步核心闭环展开为 **10 个可逐条执行的子任务**（每步含 curl 命令 + 验收点 + RoughCut 质量门槛说明）。
>
> **运行前提**：
> - 已 `npm install --prefix web` 且数据目录已隔离（`TOONFLOW_DATA_DIR=/tmp/toonflow-e2e-$(date +%s)`）。
> - 已启动 dev server：`cd web && npm run dev`（默认端口 `3456` — 与 Electron 壳一致）。
> - 替换 `:PORT` / `:PROJECT_ID` 为实际值；测试项目可用 `curl ... POST /api/projects` 自动创建。
>
> **MVP 降级说明**：本清单 **MVP 模式** — 部分步骤使用 mock / 占位（如 Phase 9 视频生成默认 mock 模式 / Phase 14 可编程供应商默认禁用），不要求每步实际跑通真实模型，但要求 curl 命令清单完整 + 关键验收点全覆盖。
>
> **RoughCut 6 项硬指标**（spec L21 — 验收 E 阶段必须可锁定）：
>
> | # | 指标 | 验证位置 |
> |---|------|---------|
> | 1 | 角色一致性（同一人物跨镜头不漂） | Phase 6 AssetVersion / Phase 10 QualityGate |
> | 2 | 构图（画面比例、主体位置） | Phase 7 ProductionFrame / Phase 10 |
> | 3 | 动作可读（动作清晰可识别） | Phase 9 Take / Phase 10 |
> | 4 | 嘴型同步（配音对口型） | Phase 11 AudioSubtitlePlan |
> | 5 | 跨镜连续（剪辑流畅） | Phase 11 RoughCut |
> | 6 | 合规（敏感词 / 版权） | Phase 13 AuditLog / 全链路 quality gate |
>
> ---

## 步骤 0 — 服务地址 + 访问模式确认（Phase 15）

确认服务地址三形态可用（localhost / lan / private_server）。

```bash
# 访问 service-addresses API（localhost 自动通过 enforceAccess）
curl -s http://localhost:3456/api/system/service-addresses | jq .

# 在浏览器打开 settings/access 页（验收 Phase 15 B2 三模式 UI）
open http://localhost:3456/settings/access
```

**验收点**：
- HTTP 状态码 200。
- 响应体含 `current` / `host` / `port` / `addresses` 三模式 / `warnings` 字段。
- `addresses[].mode` 三类：`localhost` + `lan` + `private_server`。
- `current` 默认 `localhost`，无 warnings；切换 `TOONFLOW_ACCESS_MODE=lan` 后 warnings 非空。

---

## 步骤 1 — 新建项目（Phase 3）

通过 `/api/projects` POST 创建项目，对应 spec L22 核心闭环起点。

```bash
# 新建项目
PROJECT_NAME="e2e-test-$(date +%s)"
curl -s -X POST http://localhost:3456/api/projects \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${PROJECT_NAME}\",\"description\":\"端到端验收\"}" | jq .

# 列出项目（确认新增）
curl -s http://localhost:3456/api/projects | jq '.projects[] | {id, name}'

# 记录 PROJECT_ID（取响应 .project.id）
export PROJECT_ID=<填入>
```

**验收点**：
- HTTP 状态码 200 / 201。
- 响应含 `project.id` 字段；后续步骤复用此 PROJECT_ID。
- 项目目录已建：`ls "${TOONFLOW_DATA_DIR}/projects/${PROJECT_NAME}/"`（含 `project.json`）。

---

## 步骤 2 — 导入原文（Phase 4）

上传 source document 文本到 `/api/projects/:id/source`，对应 spec 核心闭环步骤 1。

```bash
# 创建测试原文
echo "第一章：神秘的访客。下午三点，林秋接到一通电话..." > /tmp/test-source.txt

# 上传 source document（multipart 或 JSON 文本 — 实现细节见 source-service.ts）
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/source" \
  -H "Content-Type: application/json" \
  -d '{"text":"第一章：神秘的访客。下午三点，林秋接到一通电话...","fileName":"chapter-1.txt"}' | jq .

# 查询 source 列表
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/source" | jq .
```

**验收点**：
- HTTP 状态码 200 / 201。
- 响应含 `documentId` 或 `sourceId`；source_documents 表新增一行。
- Artifact 仓库已生成对应 `source/<documentId>` 目录。

---

## 步骤 3 — 生成剧本（Phase 5）

通过 `/api/projects/:id/scripts` 触发剧本 Agent 生成，对应 spec 核心闭环步骤 2。

```bash
# 触发剧本生成（默认 mock 模型）
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/scripts" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"<step2 documentId>","style":"短剧","episodes":1}' | jq .

# 查询剧本版本（含 ScriptDiff 链）
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/scripts" | jq '.scripts[] | {id, version, status}'
```

**验收点**：
- HTTP 状态码 200 / 201（mock 模式下也返回有效剧本结构）。
- 响应含 `scriptId` + `version`；可在 settings 或 web UI 看到 ScriptDiff 链。
- **MVP 降级**：未配置真实 LLM 时，Agent 返回 placeholder 文本但保持结构完整。

---

## 步骤 4 — 塑造资产（Phase 6）

通过 `/api/projects/:id/assets` 创建并塑造 IP 资产（角色 / 场景 / 道具），对应 spec 核心闭环步骤 3。

```bash
# 列出资产
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/assets" | jq '.assets[] | {id, kind, name}'

# 创建角色资产
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/assets" \
  -H "Content-Type: application/json" \
  -d '{"kind":"character","name":"林秋","description":"主角，25岁，神秘电话接收者"}' | jq .

# 生成 AssetVersion（图像 — mock 模式返回占位 URL）
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/assets/<assetId>/versions" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"林秋角色立绘","style":"漫画"}' | jq .
```

**验收点**：
- HTTP 状态码 200 / 201。
- 响应含 `assetId` + `version` + `canonicalVersionId`。
- **RoughCut 指标 1 — 角色一致性**：canonicalVersion 锁定后，后续 ProductionFrame 必须引用同一 version。

---

## 步骤 5 — A→C3 自动运行（Phase 7 auto-run）

通过 `/api/projects/:id/auto-run` 触发 A→C3 制作管线（场景拆解 / 镜头规划 / 资产关联），对应 spec 核心闭环步骤 4。

```bash
# 触发 A→C3 auto-run
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/auto-run" \
  -H "Content-Type: application/json" \
  -d '{"scriptId":"<step3 scriptId>","stages":["A","B","C1","C2","C3"]}' | jq .

# 查询 auto-run 状态
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/auto-run" | jq '.runs[] | {id, stage, status, finishedAt}'

# 查询 production frames（C3 后产物）
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/frames" | jq '.frames[] | {id, sceneId, status}'
```

**验收点**：
- HTTP 状态码 200 / 201 / 202（accepted）。
- A / B / C1 / C2 / C3 五个 stage 全部 `finishedAt` 非 null。
- production_frames 表新增多行（一帧一行）；每帧含 sceneId + assetRef。
- **RoughCut 指标 2 — 构图**：每帧含 `composition` 字段（画面比例 / 主体位置）。

---

## 步骤 6 — 路径 5（TrackPlan / Phase 8）

通过 `/api/projects/:id/path5` 触发 D 阶段 TrackPlan 决策（路径 5 = MVP 默认轨道策略），对应 spec 核心闭环步骤 5。

```bash
# 触发路径 5 决策
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/path5" \
  -H "Content-Type: application/json" \
  -d '{"strategy":"path5","frames":["<frameId1>","<frameId2>"]}' | jq .

# 查询 TrackPlan
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/tracks" | jq '.tracks[] | {id, plan, frameCount}'
```

**验收点**：
- HTTP 状态码 200 / 201。
- 响应含 `trackPlanId` + `frames[]`（指向 Phase 7 产出）。
- track_plans 表新增一行；`strategy = path5`。

---

## 步骤 7 — D 阶段视频任务（Phase 9）

通过 `/api/tasks` 或 `/api/projects/:id/tracks/:trackId/takes` 触发视频生成（默认 mock 模式），对应 spec 核心闭环步骤 5（D 阶段）。

```bash
# 列出任务队列
curl -s http://localhost:3456/api/tasks | jq '.tasks[] | {id, kind, status}'

# 触发视频 Take 生成（mock 模式返回占位 mp4 URL）
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/tracks/<trackId>/takes" \
  -H "Content-Type: application/json" \
  -d '{"frameId":"<frameId>","provider":"mock","prompt":"<动作描述>"}' | jq .

# 查询 takes
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/tracks/<trackId>/takes" | jq '.takes[] | {id, status, videoUrl, cost}'
```

**验收点**：
- HTTP 状态码 200 / 201 / 202。
- 响应含 `takeId` + `taskId` + `videoUrl`（mock 模式占位）。
- takes 表新增一行；`status = pending → running → succeeded`（mock 模式可立即 succeeded）。
- usage_records 表新增成本记录（mock 模式 cost = 0）。
- **RoughCut 指标 3 — 动作可读**：Take 元数据含 `actionDescription` 字段，QualityGate 评分时引用。

---

## 步骤 8 — Take 锁定 + QualityGate（Phase 10）

通过 `/api/projects/:id/takes/:takeId/lock` 锁定 take（必须先通过 QualityGate），对应 spec 核心闭环 D 阶段收口。

```bash
# 触发 QualityGate 评分
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/takes/<takeId>/quality-gate" \
  -H "Content-Type: application/json" \
  -d '{"checks":["character_consistency","composition","action_readability"]}' | jq .

# 锁定 take（必须 quality_gate.passed = true）
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/takes/<takeId>/lock" \
  -H "Content-Type: application/json" | jq .

# 查询锁定状态
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/takes/<takeId>" | jq '{id, locked, qualityGate}'
```

**验收点**：
- HTTP 状态码 200。
- 响应含 `locked: true` + `quality_gate.passed: true`。
- 不通过 QualityGate 的 lock 请求必须返回 4xx（验证 quality gate 守卫）。
- **RoughCut 指标 1 + 2 + 3 + 6**：QualityGate 至少检查 4 项（角色一致 / 构图 / 动作可读 / 合规）。

---

## 步骤 9 — E 粗剪 + AudioSubtitlePlan（Phase 11）

通过 `/api/projects/:id/rough-cut` 触发 E 阶段粗剪 + 配音字幕规划，对应 spec 核心闭环步骤 6。

```bash
# 触发 AudioSubtitlePlan
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/audio-subtitle" \
  -H "Content-Type: application/json" \
  -d '{"takes":["<takeId1>","<takeId2>"]}' | jq .

# 触发 RoughCut 合成（拼接 + 转场）
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/rough-cut" \
  -H "Content-Type: application/json" \
  -d '{"takes":["<takeId1>","<takeId2>"],"audioPlanId":"<planId>"}' | jq .

# 查询 RoughCut 产物
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/rough-cut" | jq '{id, status, videoUrl, duration}'
```

**验收点**：
- HTTP 状态码 200 / 201。
- 响应含 `roughCutId` + `videoUrl`（拼接后 mp4 占位 URL）+ `duration`。
- audio_subtitle_plans 表新增一行；含 `subtitles[]` + `audioTracks[]`。
- **RoughCut 指标 4 + 5**：AudioSubtitle 检查嘴型同步；RoughCut 检查跨镜连续。

---

## 步骤 10 — EpisodeDeliveryPackage 导出（Phase 11）

通过 `/api/projects/:id/delivery` 导出最终交付包，对应 spec 核心闭环终点。

```bash
# 触发 EpisodeDeliveryPackage 导出
curl -s -X POST "http://localhost:3456/api/projects/${PROJECT_ID}/delivery" \
  -H "Content-Type: application/json" \
  -d '{"roughCutId":"<roughCutId>","format":"zip"}' | jq .

# 查询交付包
curl -s "http://localhost:3456/api/projects/${PROJECT_ID}/delivery" | jq '.packages[] | {id, status, downloadUrl, sizeBytes}'

# 下载交付包（zip）
curl -s -o /tmp/delivery.zip "http://localhost:3456/api/projects/${PROJECT_ID}/delivery/<packageId>/download"

# 验证 zip 完整性
unzip -l /tmp/delivery.zip | tail -5
```

**验收点**：
- HTTP 状态码 200 / 201。
- 响应含 `packageId` + `downloadUrl` + `sizeBytes`。
- delivery_packages 表新增一行；含 `manifest.json` + `metadata.json` + 所有 takes + roughCut.mp4。
- zip 解压后含 manifest.json + 各资产文件；manifest 含 RoughCut 6 项质量门槛快照（角色一致 / 构图 / 动作可读 / 嘴型同步 / 跨镜连续 / 合规）。
- **RoughCut 指标 1-6 全覆盖**：交付包 manifest 必须含 6 项质量门槛 final 结果（passed / warning / failed）。

---

## 附录 A — 关键 API 浏览器直连冒烟测试（spec L662）

不依赖桌面壳，浏览器 / curl 直连 5 个关键 API 应全部返回 200 / 4xx（非 500）：

```bash
# 1. 项目列表
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3456/api/projects
# 期望：200

# 2. 项目剧本
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3456/api/projects/${PROJECT_ID}/scripts"
# 期望：200 或 404（非 500）

# 3. auto-run 状态
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3456/api/projects/${PROJECT_ID}/auto-run"
# 期望：200 或 4xx（非 500）

# 4. 路径 5 / TrackPlan
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3456/api/projects/${PROJECT_ID}/path5"
# 期望：200 或 4xx（非 500）

# 5. 任务队列
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3456/api/tasks
# 期望：200
```

**验收点**：5 个 curl 全部返回 200 或 4xx，**任一返回 500 / 0 / ECONNREFUSED → failed**。

---

## 附录 B — 编译 + 桌面壳验收

```bash
# Web 编译（Phase 15 H4 硬约束）
cd web && npm run build
# 期望：退出码 0；产物 web/.next/ 存在

# Electron 编译（Phase 15 H5 硬约束）
cd /Users/baodongdong/Desktop/study/agent_novels && npx tsc -p electron/tsconfig.json
# 期望：退出码 0；产物 dist-electron/main.js 存在

# 桌面壳启动（MVP 验证 — 不强制 dist 物理产物）
npm run dev:electron
# 期望：electron 主进程 spawn Next.js 子进程；BrowserWindow 加载 http://localhost:3456
```

**验收点**：两条 build 命令退出码均为 0；electron 主进程不允许 import `web/app/lib/server/*` / `web/app/api/*` / `web/app/lib/agent/*`（spec L108 + L748）。

---

## 附录 C — 数据隔离 + 测试目录

```bash
# 端到端验收必须使用临时数据目录（避免污染仓库 novels/）
export TOONFLOW_DATA_DIR=/tmp/toonflow-e2e-$(date +%s)
mkdir -p "${TOONFLOW_DATA_DIR}"

# 启动 dev server（使用隔离目录）
cd web && TOONFLOW_DATA_DIR=${TOONFLOW_DATA_DIR} npm run dev

# 验收完成后清理
rm -rf "${TOONFLOW_DATA_DIR}"
```

**验收点**：所有 10 步在 `${TOONFLOW_DATA_DIR}` 中产生数据；仓库 `novels/` 目录在验收前后保持一致（`git status -- novels/` 输出为空）。

---

## 附录 D — MVP 降级清单（与本 phase 派发明示一致）

| # | 步骤 | MVP 降级 | 完整模式 |
|---|------|---------|---------|
| 3 | 生成剧本 | mock 模型返回 placeholder | 接入真实 LLM provider |
| 4 | 塑造资产 | 图像生成 mock URL | 接入真实图像 API |
| 5 | A→C3 | 默认 strategy + mock 输出 | 实际 LLM 拆解 |
| 7 | D 阶段视频 | mock 模式立即 succeeded | 接入真实视频生成 API（seedance） |
| 9 | E 粗剪 | 视频拼接占位 | ffmpeg 真实合成 |
| 10 | 交付包 | manifest 字段完整即可 | 完整 zip + 媒体文件 |

**结论**：MVP 阶段所有 10 步可顺利 curl 调用且返回结构完整；真实生成质量与质量门槛通过率不作硬指标（设计上预留 placeholder / mock 接入）。
