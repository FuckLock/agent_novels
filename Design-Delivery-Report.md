# Design Delivery Report — Toonflow Web

**日期**：2026-05-14  
**来源**：Product-Spec.md v3.5 + Design-Brief.md  
**主设计文件**：`designs/toonflow-web-design.pen`  
**v3.5 快照文件**：`designs/toonflow-web-design-v35.pen`、`designs/toonflow-web-design-v35-verified.pen`  
**Pencil 生成脚本**：`designs/pencil-scripts/toonflow-screen.js`  
**实体化脚本**：`designs/pencil-scripts/materialize-toonflow-design.mjs`  
**PNG 导出目录**：`design_export/`

## 交付范围

### 设计变量

- 颜色：浅色工作台、白色面板、深色媒体面板、冷色主强调、成功/警告/危险/信息语义色。
- 字体：Geist、Inter、IBM Plex Mono。
- 间距：4/8/12/16/20/24/32。
- 圆角：4/6/8，pill 使用胶囊形态。

### 组件规范

共 14 个可复用组件符号，集中在 `03 Reusable Component Symbols`：

- Button/Primary、Button/Secondary、StatusPill、InputField、MetricCard、NavItem、SectionHeader
- QualityGateRow、TrackRowExpanded、AssetCard、AgentMessage、TaskRow、PipelineNode、MediaPanel

### 页面与画板

共 21 个顶层画板：

- 00 Complete Delivery Overview
- 01 Page Area Overview
- 02 Design System
- 03 Reusable Component Symbols
- 04 Project List
- 04B Project Empty + New Project
- 05 Auto Run Pipeline
- 06 IP Asset Timeline
- 07 Source Document
- 08 Script Agent
- 09 Script Management
- 10 Asset Workshop
- 11 Production Pipeline D
- 12 Path 5 D Submit Confirmation
- 13 Quality Protocol
- 14 Take Review + E RoughCut
- 15 Task Center
- 16 Settings + Security
- 17 Legacy Import Wizard
- 18 ProjectMigrationPackage Check
- 19 State Variants

## Spec 对照

- 自动管线运行视图：覆盖模式 1-5、人工停顿点、Track task grid、事件流、暂停/恢复。
- 路径 5：覆盖 D 阶段视频生成确认、批量提交、成本预算、缺失输入阻塞和 requestHash。
- 跨集 IP 资产时间线：覆盖角色/服装/场景/道具的 canonicalVersion、漂移风险和跨集复用。
- 质量评估协议：覆盖角色一致性、时长边界、Artifact 完整性、人工豁免、阻塞规则和 QualityReport。
- Take 审核与 E 粗剪交付：保留局部深色审片面板，并将单集输出明确为 EpisodeDeliveryPackage。
- ProjectMigrationPackage：只放在设置/迁移治理路径，和 EpisodeDeliveryPackage 边界已拆清。
- 其余主页面覆盖项目列表、小说原文、剧本 Agent、剧本管理、塑造、制作工作台、任务中心、设置和 Legacy Import。

## 校验结果

- 使用 Pencil MCP 生成、截图和导出，未用文档假替代设计稿。
- 已将脚本节点实体化为普通 Pencil 节点，避免脚本节点截图/导出为空画布。
- `snapshot_layout` 抽查 Auto Run、Path 5、IP Timeline、Quality Protocol、RoughCut：无布局问题。
- 截图抽查 Complete Overview、Path 5、Take/E RoughCut、ProjectMigrationPackage：渲染正常。
- Node Function 检查：21 个 screen 均返回有效节点。
- PNG 导出：21 个顶层画板已导出到 `design_export/`。

## PNG 导出清单

| 文件 | 对应画板 |
| --- | --- |
| `design_export/g11oJ.png` | 00 Complete Delivery Overview |
| `design_export/00jA3.png` | 01 Page Area Overview |
| `design_export/XomxJ.png` | 02 Design System |
| `design_export/rfq8K.png` | 03 Reusable Component Symbols |
| `design_export/t3YZ4.png` | 04 Project List |
| `design_export/qkvbM.png` | 04B Project Empty + New Project |
| `design_export/gELCJ.png` | 05 Auto Run Pipeline |
| `design_export/0sFDp.png` | 06 IP Asset Timeline |
| `design_export/aZsBU.png` | 07 Source Document |
| `design_export/wabbS.png` | 08 Script Agent |
| `design_export/W8TSr.png` | 09 Script Management |
| `design_export/BJUUw.png` | 10 Asset Workshop |
| `design_export/tnCIh.png` | 11 Production Pipeline D |
| `design_export/S7hxr.png` | 12 Path 5 D Submit Confirmation |
| `design_export/jRBEl.png` | 13 Quality Protocol |
| `design_export/D8fY7.png` | 14 Take Review + E RoughCut |
| `design_export/ojOq5.png` | 15 Task Center |
| `design_export/0uzii.png` | 16 Settings + Security |
| `design_export/IXUQX.png` | 17 Legacy Import Wizard |
| `design_export/JOLO6.png` | 18 ProjectMigrationPackage Check |
| `design_export/5G1Ly.png` | 19 State Variants |

## 未覆盖内容

无阻塞性遗漏。移动端断点、完整非线编、公开素材市场、云端多租户和完整 TTS/混音/字幕精修不属于当前 Product-Spec v3.5 核心闭环。
