/**
 * @schema 2.10
 * @input screen: string = "design_system"
 */

const W = pencil.width || 1440;
const H = pencil.height || 960;
const screen = pencil.input.screen || "design_system";

const C = {
  canvas: "$surface.canvas",
  panel: "$surface.panel",
  raised: "$surface.raised",
  inverse: "$surface.inverse",
  inverseRaised: "$surface.inverseRaised",
  text: "$text.primary",
  secondary: "$text.secondary",
  muted: "$text.muted",
  inverseText: "$text.inverse",
  border: "$border.subtle",
  strong: "$border.strong",
  blue: "$accent.primary",
  blueSoft: "$accent.primarySoft",
  success: "$semantic.success",
  successSoft: "$semantic.successSoft",
  warning: "$semantic.warning",
  warningSoft: "$semantic.warningSoft",
  danger: "$semantic.danger",
  dangerSoft: "$semantic.dangerSoft",
  info: "$semantic.info",
  infoSoft: "$semantic.infoSoft",
};

function rect(x, y, width, height, fill, options = {}) {
  const node = {
    type: "frame",
    layout: "none",
    x,
    y,
    width,
    height,
    fill,
  };
  if (options.name) node.name = options.name;
  if (options.r !== undefined) node.cornerRadius = options.r;
  if (options.stroke) {
    node.stroke = {
      thickness: options.strokeWidth || 1,
      fill: options.stroke,
      align: "inside",
    };
  }
  if (options.children) node.children = options.children;
  if (options.clip) node.clip = true;
  if (options.opacity !== undefined) node.opacity = options.opacity;
  return node;
}

function txt(content, x, y, width, options = {}) {
  return {
    type: "text",
    x,
    y,
    width,
    textGrowth: "fixed-width",
    content,
    fill: options.fill || C.text,
    fontFamily: options.font || "Geist",
    fontSize: options.size || 13,
    fontWeight: options.weight || "400",
    lineHeight: options.lineHeight || 1.25,
    textAlign: options.align || "left",
  };
}

function line(x, y, width, color = C.border) {
  return rect(x, y, width, 1, color);
}

function pill(label, x, y, kind = "info", width = 86) {
  const palette = {
    current: [C.blueSoft, C.blue],
    success: [C.successSoft, C.success],
    warning: [C.warningSoft, C.warning],
    danger: [C.dangerSoft, C.danger],
    info: [C.infoSoft, C.info],
    neutral: [C.raised, C.secondary],
    inverse: [C.inverseRaised, C.inverseText],
  }[kind] || [C.raised, C.secondary];
  return rect(x, y, width, 24, palette[0], {
    r: 12,
    stroke: kind === "neutral" ? C.border : palette[0],
    children: [txt(label, 10, 5, width - 20, { size: 11, weight: "600", fill: palette[1], align: "center" })],
  });
}

function button(label, x, y, width, variant = "primary") {
  const fill = variant === "primary" ? C.blue : variant === "danger" ? C.dangerSoft : C.panel;
  const text = variant === "primary" ? C.inverseText : variant === "danger" ? C.danger : C.text;
  const stroke = variant === "primary" ? C.blue : C.border;
  return rect(x, y, width, 36, fill, {
    r: 6,
    stroke,
    children: [txt(label, 14, 10, width - 28, { size: 13, weight: "600", fill: text, align: "center" })],
  });
}

function input(label, value, x, y, width) {
  return rect(x, y, width, 56, C.panel, {
    r: 6,
    stroke: C.border,
    children: [
      txt(label, 12, 8, width - 24, { size: 11, fill: C.muted, weight: "600" }),
      txt(value, 12, 29, width - 24, { size: 13, fill: C.text }),
    ],
  });
}

function metric(label, value, x, y, width, kind = "neutral") {
  const color = kind === "success" ? C.success : kind === "warning" ? C.warning : kind === "danger" ? C.danger : C.text;
  return rect(x, y, width, 74, C.panel, {
    r: 8,
    stroke: C.border,
    children: [
      txt(label, 14, 12, width - 28, { size: 11, fill: C.muted, weight: "600" }),
      txt(value, 14, 36, width - 28, { size: 22, fill: color, weight: "700", font: "IBM Plex Mono" }),
    ],
  });
}

function sidebar(active) {
  const nav = [
    ["projects", "项", "项目"],
    ["source", "文", "文本"],
    ["agent", "智", "Agent"],
    ["assets", "塑", "资产"],
    ["pipeline", "制", "制作"],
    ["tasks", "任", "任务"],
    ["settings", "设", "设置"],
  ];
  const children = [
    rect(18, 18, 36, 36, C.inverse, { r: 8, children: [txt("TF", 7, 9, 22, { size: 13, fill: C.inverseText, weight: "700", align: "center" })] }),
  ];
  for (let i = 0; i < nav.length; i += 1) {
    const [key, icon, label] = nav[i];
    const y = 84 + i * 68;
    const selected = active === key;
    children.push(rect(12, y, 48, 50, selected ? C.blueSoft : C.panel, {
      r: 8,
      stroke: selected ? C.blueSoft : C.panel,
      children: [
        txt(icon, 11, 7, 26, { size: 15, fill: selected ? C.blue : C.secondary, weight: "700", align: "center" }),
        txt(label, 6, 29, 36, { size: 10, fill: selected ? C.blue : C.muted, align: "center" }),
      ],
    }));
  }
  return rect(0, 0, 72, H, C.panel, {
    name: "Global Sidebar",
    stroke: C.border,
    children,
  });
}

function header(title, subtitle, actionLabel) {
  const children = [
    txt(title, 24, 15, 420, { size: 20, weight: "700" }),
    txt(subtitle, 24, 40, 600, { size: 12, fill: C.secondary }),
    pill("Runtime passed", 936, 20, "success", 116),
    pill("local_hybrid", 1064, 20, "neutral", 112),
  ];
  if (actionLabel) children.push(button(actionLabel, 1208, 14, 132, "primary"));
  return rect(72, 0, W - 72, 68, C.panel, { stroke: C.border, children });
}

function projectTabs(active) {
  const tabs = [
    ["source", "小说原文"],
    ["agent", "剧本 Agent"],
    ["scripts", "剧本管理"],
    ["assets", "塑造"],
    ["pipeline", "制作工作台"],
    ["take", "粗剪交付"],
  ];
  const children = [];
  let x = 24;
  for (let i = 0; i < tabs.length; i += 1) {
    const [key, label] = tabs[i];
    const w = key === "pipeline" || key === "take" ? 110 : 92;
    children.push(rect(x, 10, w, 30, active === key ? C.inverse : C.panel, {
      r: 15,
      stroke: active === key ? C.inverse : C.border,
      children: [txt(label, 12, 8, w - 24, { size: 12, fill: active === key ? C.inverseText : C.secondary, weight: "600", align: "center" })],
    }));
    x += w + 8;
  }
  children.push(txt("《雾海金线》  EP03  第 12-15 章", 866, 16, 290, { size: 12, fill: C.secondary, align: "right" }));
  children.push(pill("revision 42", 1170, 13, "neutral", 94));
  children.push(pill("2 stale", 1274, 13, "warning", 76));
  return rect(72, 68, W - 72, 50, C.raised, { stroke: C.border, children });
}

function shell(active, title, subtitle, tab, action, content) {
  const base = [
    rect(0, 0, W, H, C.canvas),
    sidebar(active),
    header(title, subtitle, action),
  ];
  if (tab) base.push(projectTabs(tab));
  return base.concat(content);
}

function sectionTitle(title, subtitle, x, y, width) {
  return [
    txt(title, x, y, width, { size: 16, weight: "700" }),
    txt(subtitle, x, y + 24, width, { size: 12, fill: C.secondary }),
  ];
}

function progressBar(x, y, width, pct, kind = "success") {
  const color = kind === "warning" ? C.warning : kind === "danger" ? C.danger : C.blue;
  return rect(x, y, width, 8, C.raised, {
    r: 4,
    stroke: C.border,
    children: [rect(0, 0, Math.max(12, width * pct), 8, color, { r: 4 })],
  });
}

function projectCard(name, meta, status, pct, x, y, kind) {
  return rect(x, y, 378, 174, C.panel, {
    r: 8,
    stroke: C.border,
    children: [
      txt(name, 18, 18, 250, { size: 17, weight: "700" }),
      pill(status, 270, 18, kind, 86),
      txt(meta, 18, 48, 318, { size: 12, fill: C.secondary }),
      line(18, 82, 342),
      txt("章节", 18, 102, 72, { size: 11, fill: C.muted, weight: "600" }),
      txt("48", 18, 124, 72, { size: 20, font: "IBM Plex Mono", weight: "700" }),
      txt("剧本", 108, 102, 72, { size: 11, fill: C.muted, weight: "600" }),
      txt("12", 108, 124, 72, { size: 20, font: "IBM Plex Mono", weight: "700" }),
      txt("Track", 198, 102, 72, { size: 11, fill: C.muted, weight: "600" }),
      txt("31", 198, 124, 72, { size: 20, font: "IBM Plex Mono", weight: "700" }),
      progressBar(18, 154, 342, pct, kind === "danger" ? "danger" : "success"),
    ],
  });
}

function tableRow(items, x, y, widths, options = {}) {
  const children = [];
  let cursor = 0;
  for (let i = 0; i < items.length; i += 1) {
    children.push(txt(items[i], cursor + 12, 11, widths[i] - 24, {
      size: options.header ? 11 : 12,
      fill: options.header ? C.muted : C.text,
      weight: options.header ? "700" : "400",
    }));
    if (i < items.length - 1) children.push(rect(cursor + widths[i], 0, 1, 38, C.border));
    cursor += widths[i];
  }
  return rect(x, y, widths.reduce((a, b) => a + b, 0), 38, options.header ? C.raised : C.panel, {
    stroke: C.border,
    children,
  });
}

function checkRow(label, detail, status, x, y, width) {
  const kind = status === "passed" ? "success" : status === "warning" ? "warning" : status === "failed" ? "danger" : "neutral";
  return rect(x, y, width, 58, C.panel, {
    r: 6,
    stroke: C.border,
    children: [
      pill(status, 12, 16, kind, 82),
      txt(label, 108, 12, width - 220, { size: 13, weight: "700" }),
      txt(detail, 108, 32, width - 220, { size: 11, fill: C.secondary }),
      txt("查看", width - 72, 22, 48, { size: 12, fill: C.blue, weight: "600", align: "right" }),
    ],
  });
}

function agentPanel(x, y, width, height, title = "Production Agent") {
  return rect(x, y, width, height, C.panel, {
    r: 8,
    stroke: C.border,
    children: [
      txt(title, 16, 14, width - 32, { size: 15, weight: "700" }),
      pill("Qwen3 Max", width - 128, 12, "neutral", 108),
      line(0, 48, width),
      rect(16, 66, width - 32, 76, C.raised, { r: 8, stroke: C.border, children: [
        txt("系统", 12, 10, 80, { size: 11, fill: C.muted, weight: "700" }),
        txt("D2 依赖检查完成，T03 缺少尾帧确认。建议先生成首帧，再提交视频任务。", 12, 31, width - 56, { size: 12, fill: C.secondary }),
      ] }),
      rect(16, 154, width - 32, 86, C.blueSoft, { r: 8, stroke: C.blueSoft, children: [
        txt("用户", 12, 10, 80, { size: 11, fill: C.blue, weight: "700" }),
        txt("开始导演分析，并列出当前集的视觉资产缺口。", 12, 31, width - 56, { size: 12, fill: C.text }),
      ] }),
      rect(16, height - 72, width - 32, 48, C.raised, { r: 8, stroke: C.border, children: [
        txt("输入指令，或选择快捷动作", 14, 16, width - 150, { size: 12, fill: C.muted }),
        button("执行", width - 104, 6, 74, "primary"),
      ] }),
    ],
  });
}

function designSystem() {
  const nodes = [rect(0, 0, W, H, C.canvas)];
  nodes.push(txt("Toonflow Web Design System", 48, 42, 560, { size: 28, weight: "700" }));
  nodes.push(txt("冷静、精密、可控。组件为开发计划提供语义和状态基准。", 48, 82, 720, { size: 14, fill: C.secondary }));
  const swatches = [
    ["Canvas", C.canvas], ["Panel", C.panel], ["Inverse", C.inverse], ["Accent", C.blue],
    ["Success", C.success], ["Warning", C.warning], ["Danger", C.danger], ["Info", C.info],
  ];
  for (let i = 0; i < swatches.length; i += 1) {
    const x = 48 + (i % 4) * 180;
    const y = 136 + Math.floor(i / 4) * 92;
    nodes.push(rect(x, y, 150, 62, swatches[i][1], { r: 8, stroke: C.border }));
    nodes.push(txt(swatches[i][0], x, y + 70, 150, { size: 12, fill: C.secondary }));
  }
  nodes.push(rect(832, 132, 500, 284, C.panel, { r: 8, stroke: C.border, children: [
    txt("Typography", 24, 22, 280, { size: 18, weight: "700" }),
    txt("标题用于定位，不做营销大字。数据和任务 ID 使用等宽字体。", 24, 52, 420, { size: 12, fill: C.secondary }),
    txt("剧本版本与 Track 状态", 24, 96, 420, { size: 24, weight: "700" }),
    txt("ScriptVersion sv-EP03-014  |  Track T03  |  providerJobId sd_2481", 24, 136, 420, { size: 13, font: "IBM Plex Mono", fill: C.secondary }),
    txt("长文本阅读保持清晰，表格和状态保持紧凑，避免普通后台感。", 24, 178, 420, { size: 14, fill: C.text }),
  ] }));
  nodes.push(rect(48, 350, 700, 250, C.panel, { r: 8, stroke: C.border, children: [
    txt("Core Components", 24, 22, 240, { size: 18, weight: "700" }),
    button("主要操作", 24, 66, 116, "primary"),
    button("次要操作", 156, 66, 116, "secondary"),
    button("危险操作", 288, 66, 116, "danger"),
    pill("passed", 24, 124, "success", 84),
    pill("stale", 118, 124, "warning", 84),
    pill("failed", 212, 124, "danger", 84),
    pill("waived", 306, 124, "info", 88),
    input("ModelConfig", "seedance-2.0 / video / enabled", 424, 56, 238),
    checkRow("角色一致性", "2 个参考资产通过，1 个服装版本需确认", "warning", 24, 174, 638),
  ] }));
  nodes.push(rect(832, 462, 500, 300, C.panel, { r: 8, stroke: C.border, children: [
    txt("Track Row Pattern", 24, 22, 260, { size: 18, weight: "700" }),
    rect(24, 70, 452, 88, C.raised, { r: 8, stroke: C.border, children: [
      txt("T03  夜市追逐前半段", 16, 14, 190, { size: 14, weight: "700" }),
      pill("preparing", 220, 12, "warning", 94),
      txt("0-2s 侧身躲避  |  2-6s 冲入巷口  |  6-9s 回头看镜头", 16, 45, 330, { size: 12, fill: C.secondary }),
      txt("start_frame", 352, 45, 82, { size: 12, fill: C.blue, font: "IBM Plex Mono" }),
    ] }),
    rect(24, 176, 452, 86, C.inverse, { r: 8, stroke: C.inverse, children: [
      txt("Media Preview Panel", 18, 16, 250, { size: 14, fill: C.inverseText, weight: "700" }),
      txt("深色只用于视频/take 审核，不占据全局工作台。", 18, 42, 300, { size: 12, fill: C.muted }),
      rect(342, 16, 84, 54, C.inverseRaised, { r: 6, stroke: C.strong }),
    ] }),
  ] }));
  nodes.push(rect(48, 642, 700, 196, C.panel, { r: 8, stroke: C.border, children: [
    txt("State Grammar", 24, 20, 260, { size: 18, weight: "700" }),
    pill("draft", 24, 66, "neutral", 78),
    pill("running", 112, 66, "info", 86),
    pill("locked", 208, 66, "success", 82),
    pill("over_budget", 300, 66, "warning", 110),
    pill("compliance_failed", 420, 66, "danger", 146),
    pill("reconciling", 24, 112, "info", 106),
    pill("duplicate_blocked", 140, 112, "warning", 138),
    pill("blocked_by_missing_input", 288, 112, "danger", 190),
  ] }));
  return nodes;
}

function componentSymbols() {
  const nodes = [
    rect(0, 0, W, H, C.canvas),
    txt("Reusable Component Symbols", 48, 42, 520, { size: 28, weight: "700" }),
    txt("14 个可复用组件符号，供开发阶段按语义映射到前端组件。", 48, 82, 680, { size: 14, fill: C.secondary }),
  ];
  const items = [
    ["Button/Primary", "主要命令", "primary"],
    ["Button/Secondary", "次要命令", "secondary"],
    ["StatusPill", "状态标记", "pill"],
    ["InputField", "表单字段", "input"],
    ["MetricCard", "指标卡片", "metric"],
    ["NavItem", "侧栏导航", "nav"],
    ["SectionHeader", "区块标题", "section"],
    ["QualityGateRow", "质量门禁", "gate"],
    ["TrackRowExpanded", "Track 展开行", "track"],
    ["AssetCard", "资产卡片", "asset"],
    ["AgentMessage", "Agent 消息", "message"],
    ["TaskRow", "任务行", "task"],
    ["PipelineNode", "管线节点", "node"],
    ["MediaPanel", "媒体预览", "media"],
  ];
  for (let i = 0; i < items.length; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 48 + col * 330;
    const y = 142 + row * 178;
    const card = rect(x, y, 286, 132, items[i][2] === "media" ? C.inverse : C.panel, {
      name: `Component/${items[i][0]}`,
      r: 8,
      stroke: items[i][2] === "media" ? C.inverse : C.border,
      children: [
        txt(items[i][0], 16, 14, 190, { size: 14, weight: "700", fill: items[i][2] === "media" ? C.inverseText : C.text }),
        txt(items[i][1], 16, 38, 190, { size: 11, fill: items[i][2] === "media" ? C.muted : C.secondary }),
      ],
    });
    card.reusable = true;
    if (items[i][2] === "primary") card.children.push(button("Primary", 16, 76, 92, "primary"));
    if (items[i][2] === "secondary") card.children.push(button("Secondary", 16, 76, 104, "secondary"));
    if (items[i][2] === "pill") card.children.push(pill("warning", 16, 78, "warning", 90), pill("locked", 116, 78, "success", 82));
    if (items[i][2] === "input") card.children.push(input("字段", "输入值", 16, 66, 220));
    if (items[i][2] === "metric") card.children.push(txt("7", 16, 72, 80, { size: 26, font: "IBM Plex Mono", weight: "700" }), txt("running task", 76, 82, 120, { size: 12, fill: C.secondary }));
    if (items[i][2] === "nav") card.children.push(rect(16, 72, 48, 42, C.blueSoft, { r: 8, children: [txt("制", 16, 10, 16, { size: 14, fill: C.blue, weight: "700" })] }));
    if (items[i][2] === "section") card.children.push(txt("区块标题", 16, 76, 120, { size: 15, weight: "700" }), txt("说明文本", 16, 100, 120, { size: 11, fill: C.secondary }));
    if (items[i][2] === "gate") card.children.push(rect(16, 66, 248, 48, C.raised, { r: 6, stroke: C.border, children: [
      pill("passed", 12, 10, "success", 76),
      txt("门禁项 / 原因", 100, 14, 110, { size: 12, fill: C.secondary }),
    ] }));
    if (items[i][2] === "track") card.children.push(rect(16, 66, 248, 48, C.raised, { r: 6, stroke: C.border, children: [txt("T03  TrackSegment", 12, 10, 130, { size: 12, weight: "700" }), pill("preparing", 150, 10, "warning", 82)] }));
    if (items[i][2] === "asset") card.children.push(rect(16, 66, 72, 48, C.raised, { r: 6, stroke: C.border }), txt("AssetVersion", 104, 76, 110, { size: 12, weight: "700" }));
    if (items[i][2] === "message") card.children.push(rect(16, 66, 248, 48, C.raised, { r: 6, stroke: C.border, children: [txt("Production Agent", 12, 10, 120, { size: 11, weight: "700" }), txt("建议先生成首帧。", 12, 28, 160, { size: 11, fill: C.secondary })] }));
    if (items[i][2] === "task") card.children.push(tableRow(["tk-482", "running", "$2.70"], 16, 72, [82, 82, 82]));
    if (items[i][2] === "node") card.children.push(rect(16, 70, 96, 44, C.raised, { r: 8, stroke: C.border, children: [txt("D", 40, 12, 16, { size: 16, weight: "700", align: "center" })] }));
    if (items[i][2] === "media") card.children.push(rect(16, 66, 120, 48, C.inverseRaised, { r: 6, stroke: C.strong }), txt("Take Preview", 152, 78, 90, { size: 12, fill: C.inverseText }));
    nodes.push(card);
  }
  return nodes;
}

function projectList(empty = false) {
  const content = [];
  if (!empty) {
    content.push(...sectionTitle("项目列表", "扫描、比较并继续短剧生产，不做营销卡片墙。", 112, 108, 560));
    content.push(projectCard("雾海金线", "古装悬疑 | 9:16 | 最近活动 12 分钟前", "active", 0.64, 112, 178, "success"));
    content.push(projectCard("归山令", "玄幻逆袭 | 16:9 | 3 个任务运行中", "running", 0.42, 512, 178, "info"));
    content.push(projectCard("春风渡", "民国情感 | 存在 stale 资产引用", "stale", 0.35, 912, 178, "warning"));
    content.push(projectCard("星舰边境", "科幻短剧 | RuntimeCheck failed", "blocked", 0.18, 112, 378, "danger"));
    content.push(metric("本地项目", "12", 512, 378, 170));
    content.push(metric("运行中 Task", "7", 700, 378, 170, "warning"));
    content.push(metric("本月实际成本", "$184", 888, 378, 190));
    content.push(rect(1100, 378, 210, 174, C.panel, { r: 8, stroke: C.border, children: [
      txt("RuntimeCheck", 16, 16, 170, { size: 15, weight: "700" }),
      pill("passed", 16, 50, "success", 82),
      txt("dataRoot、SQLite、ffmpeg、视频范围请求均可用。", 16, 86, 160, { size: 12, fill: C.secondary }),
    ] }));
    content.push(rect(112, 600, 1198, 230, C.panel, { r: 8, stroke: C.border, children: [
      txt("最近活动", 20, 18, 220, { size: 16, weight: "700" }),
      tableRow(["时间", "对象", "操作", "状态", "Operator"], 20, 56, [160, 300, 360, 160, 178], { header: true }),
      tableRow(["20:14", "EP03 / T03", "锁定 take 并进入 RoughCut", "locked", "baodong"], 20, 94, [160, 300, 360, 160, 178]),
      tableRow(["20:05", "Asset / 阿令", "设置 canonicalVersion", "passed", "baodong"], 20, 132, [160, 300, 360, 160, 178]),
      tableRow(["19:48", "ExportPackage", "排除 SecretRef 后导出", "ready", "owner"], 20, 170, [160, 300, 360, 160, 178]),
    ] }));
  } else {
    content.push(rect(420, 204, 600, 320, C.panel, { r: 8, stroke: C.border, children: [
      txt("还没有项目", 40, 42, 520, { size: 24, weight: "700", align: "center" }),
      txt("创建第一个本地工作空间项目，或只读扫描旧 novels 目录。", 80, 84, 440, { size: 14, fill: C.secondary, align: "center" }),
      button("新建项目", 168, 140, 120, "primary"),
      button("导入旧项目", 312, 140, 120, "secondary"),
      line(40, 208, 520),
      txt("空状态必须给出下一步，不用插画堆情绪。", 80, 232, 440, { size: 12, fill: C.muted, align: "center" }),
    ] }));
    content.push(rect(460, 570, 520, 260, C.panel, { r: 8, stroke: C.border, children: [
      txt("新建项目", 24, 22, 200, { size: 18, weight: "700" }),
      input("项目名称", "雾海金线", 24, 66, 220),
      input("小说类型", "古装悬疑", 264, 66, 220),
      input("影片画风", "写实漫剧，冷色夜景", 24, 138, 220),
      input("画面比例", "9:16", 264, 138, 220),
      button("取消", 264, 218, 92, "secondary"),
      button("创建", 372, 218, 112, "primary"),
    ] }));
  }
  return shell("projects", empty ? "项目列表空状态" : "项目列表", "HTTP 本地工作台入口，显示项目、运行环境和最近活动。", null, empty ? null : "新建项目", content);
}

function sourceScreen() {
  const content = [
    rect(96, 142, 280, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("章节", 18, 16, 150, { size: 16, weight: "700" }),
      button("上传/粘贴", 166, 10, 94, "primary"),
      tableRow(["章", "标题", "状态"], 16, 58, [44, 142, 76], { header: true }),
      tableRow(["12", "雾市初见", "locked"], 16, 96, [44, 142, 76]),
      tableRow(["13", "金线断处", "draft"], 16, 134, [44, 142, 76]),
      tableRow(["14", "旧宅夜雨", "stale"], 16, 172, [44, 142, 76]),
      tableRow(["15", "港口追逐", "draft"], 16, 210, [44, 142, 76]),
      rect(16, 272, 248, 86, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("解析提醒", 12, 12, 200, { size: 13, weight: "700", fill: C.warning }),
        txt("第 14 章存在疑似合章，保存前可人工拆分。", 12, 38, 210, { size: 12, fill: C.secondary }),
      ] }),
    ] }),
    rect(396, 142, 600, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("SourceDocument / Chapter 14", 22, 20, 360, { size: 17, weight: "700" }),
      pill("revision 18", 456, 18, "neutral", 104),
      line(0, 58, 600),
      txt("雨声压低了旧宅的木窗。阿令站在廊下，看见那根金线从门缝里延伸出来，像某种沉默的指引。", 28, 88, 544, { size: 16, lineHeight: 1.55 }),
      txt("她没有立刻进去。上一章的港口线索在这里回收，但人物动机仍然偏弱，建议剧本 Agent 后续补一段对父亲失踪的回忆。", 28, 190, 544, { size: 15, lineHeight: 1.55, fill: C.secondary }),
      rect(28, 320, 544, 120, C.raised, { r: 8, stroke: C.border, children: [
        txt("编辑模式", 18, 16, 160, { size: 13, weight: "700" }),
        txt("关闭或切换章节前，如果存在未保存内容，需要弹出影响确认。", 18, 44, 480, { size: 12, fill: C.secondary }),
      ] }),
      button("保存 revision", 348, 682, 122, "primary"),
      button("回滚", 486, 682, 72, "secondary"),
    ] }),
    rect(1016, 142, 328, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("解析与影响", 18, 16, 190, { size: 16, weight: "700" }),
      checkRow("章节边界", "第 14 章检测到 2 个数字标题", "warning", 16, 58, 296),
      checkRow("下游影响", "EP03 ScriptVersion、T02、T03 将 stale", "warning", 16, 128, 296),
      checkRow("原文 Artifact", "source/chapters/chapter-14.md", "passed", 16, 198, 296),
      rect(16, 292, 296, 180, C.raised, { r: 8, stroke: C.border, children: [
        txt("上传/粘贴弹窗状态", 14, 14, 220, { size: 13, weight: "700" }),
        input("输入来源", ".txt / 粘贴文本", 14, 46, 268),
        txt("解析失败时保留原文 Artifact，并提供手动分段。", 14, 118, 250, { size: 12, fill: C.secondary }),
      ] }),
    ] }),
  ];
  return shell("source", "小说原文", "导入、解析、编辑章节，并在保存前提示下游影响。", "source", "生成骨架", content);
}

function scriptAgentScreen() {
  const content = [
    rect(96, 142, 384, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("剧本 Agent", 18, 16, 180, { size: 16, weight: "700" }),
      pill("qwen3-max", 252, 14, "neutral", 112),
      line(0, 52, 384),
      rect(18, 74, 330, 78, C.raised, { r: 8, stroke: C.border, children: [txt("读取第 12-15 章，生成全局故事骨架，并标记可短剧化冲突。", 14, 18, 288, { size: 12, fill: C.secondary })] }),
      rect(36, 170, 330, 80, C.blueSoft, { r: 8, stroke: C.blueSoft, children: [txt("先生成故事骨架，再继续改编策略。", 14, 20, 290, { size: 13, fill: C.text })] }),
      rect(18, 270, 330, 112, C.raised, { r: 8, stroke: C.border, children: [
        txt("AgentRun ar-2914", 14, 14, 160, { size: 12, font: "IBM Plex Mono", fill: C.secondary }),
        txt("工具调用：read_chapters、create_story_outline、write_usage_record", 14, 40, 288, { size: 12, fill: C.secondary }),
        progressBar(14, 88, 260, 0.72, "success"),
      ] }),
      rect(18, 672, 348, 50, C.raised, { r: 8, stroke: C.border, children: [
        txt("输入意图或选择快捷动作", 14, 17, 218, { size: 12, fill: C.muted }),
        button("发送", 256, 7, 74, "primary"),
      ] }),
    ] }),
    rect(504, 142, 472, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("故事骨架", 20, 16, 180, { size: 16, weight: "700" }),
      pill("reviewed", 350, 14, "success", 90),
      rect(20, 58, 432, 160, C.raised, { r: 8, stroke: C.border, children: [
        txt("全局主线", 14, 14, 160, { size: 13, weight: "700" }),
        txt("阿令追查金线来源，逐步发现旧宅、港口和家族债务之间的隐藏交易。", 14, 44, 390, { size: 13, lineHeight: 1.45, fill: C.secondary }),
      ] }),
      rect(20, 238, 432, 168, C.raised, { r: 8, stroke: C.border, children: [
        txt("改编策略", 14, 14, 160, { size: 13, weight: "700" }),
        txt("每集保留一个悬念点。EP03 聚焦追逐与旧宅对峙，删去旁支人物。", 14, 44, 390, { size: 13, lineHeight: 1.45, fill: C.secondary }),
        pill("manual override", 300, 118, "info", 114),
      ] }),
      rect(20, 426, 432, 250, C.raised, { r: 8, stroke: C.border, children: [
        txt("ScriptVersion sv-EP03-014", 14, 14, 250, { size: 13, weight: "700", font: "IBM Plex Mono" }),
        txt("第 3 集：雾市旧宅", 14, 44, 220, { size: 15, weight: "700" }),
        txt("场景 6 个，台词 42 句，预计 92 秒。锁定前需通过文本质量门禁。", 14, 74, 380, { size: 13, fill: C.secondary }),
        button("审核", 220, 194, 82, "secondary"),
        button("锁定", 316, 194, 82, "primary"),
      ] }),
    ] }),
    rect(1000, 142, 344, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("版本与质量门禁", 18, 16, 200, { size: 16, weight: "700" }),
      checkRow("StoryOutline", "输入章节版本匹配", "passed", 16, 58, 312),
      checkRow("AdaptationPlan", "EP03 手工覆盖 1 处", "waived", 16, 128, 312),
      checkRow("ScriptVersion", "缺少角色动机补充", "warning", 16, 198, 312),
      rect(16, 298, 312, 212, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("提示注入保护", 14, 14, 220, { size: 14, weight: "700", fill: C.warning }),
        txt("导入文本只作为内容上下文，不能覆盖 Skill、工具权限或 SecretRef 策略。", 14, 44, 260, { size: 12, fill: C.secondary }),
      ] }),
    ] }),
  ];
  return shell("agent", "剧本 Agent", "紧凑消息流，不做大聊天窗口；所有输出写入版本对象和 AgentRun。", "agent", "继续生成", content);
}

function scriptManagementScreen() {
  const content = [
    rect(96, 142, 1248, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("剧本管理", 22, 18, 220, { size: 17, weight: "700" }),
      input("搜索", "EP03 / 雾市 / 阿令", 22, 56, 240),
      pill("12 episodes", 282, 72, "neutral", 96),
      button("批量导出", 1050, 60, 92, "secondary"),
      button("开始制作", 1156, 60, 92, "primary"),
      line(0, 130, 1248),
      rect(22, 158, 360, 178, C.raised, { r: 8, stroke: C.border, children: [
        txt("EP03 雾市旧宅", 18, 18, 220, { size: 16, weight: "700" }),
        pill("locked", 252, 16, "success", 82),
        txt("sv-EP03-014  |  场景 6  |  台词 42  |  字数 3840", 18, 54, 300, { size: 12, fill: C.secondary }),
        txt("关联资产：阿令、旧宅、金线、夜行衣", 18, 88, 300, { size: 12, fill: C.secondary }),
        button("详情", 148, 126, 76, "secondary"),
        button("制作", 240, 126, 76, "primary"),
      ] }),
      rect(404, 158, 360, 178, C.raised, { r: 8, stroke: C.border, children: [
        txt("EP04 港口追逐", 18, 18, 220, { size: 16, weight: "700" }),
        pill("stale", 252, 16, "warning", 82),
        txt("上游章节 revision 变化，T02/T03 需重算。", 18, 54, 300, { size: 12, fill: C.secondary }),
        button("查看影响", 208, 126, 108, "secondary"),
      ] }),
      rect(786, 158, 360, 178, C.raised, { r: 8, stroke: C.border, children: [
        txt("EP05 旧账翻出", 18, 18, 220, { size: 16, weight: "700" }),
        pill("draft", 252, 16, "neutral", 82),
        txt("外部剧本文本导入，骨架和策略标记 manual。", 18, 54, 300, { size: 12, fill: C.secondary }),
        button("审核", 240, 126, 76, "secondary"),
      ] }),
      rect(290, 370, 668, 312, C.panel, { r: 8, stroke: C.strong, children: [
        txt("详情弹窗：ScriptVersion 对比", 24, 22, 300, { size: 18, weight: "700" }),
        pill("impact: 3 downstream", 462, 20, "warning", 156),
        tableRow(["版本", "来源", "状态", "操作"], 24, 68, [120, 240, 120, 140], { header: true }),
        tableRow(["v14", "AgentRun ar-2914", "locked", "当前"], 24, 106, [120, 240, 120, 140]),
        tableRow(["v13", "人工编辑", "reviewed", "回滚"], 24, 144, [120, 240, 120, 140]),
        txt("差异：新增旧宅回忆段，删除港口支线人物。回滚会触发下游影响检查。", 24, 204, 580, { size: 13, fill: C.secondary }),
        button("取消", 430, 250, 80, "secondary"),
        button("保存并检查影响", 526, 250, 118, "primary"),
      ] }),
    ] }),
  ];
  return shell("source", "剧本管理", "卡片扫描、版本对比、关联资产和下游影响确认。", "scripts", "导出剧本", content);
}

function assetsScreen() {
  const content = [
    rect(96, 142, 246, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("批量操作", 18, 16, 140, { size: 16, weight: "700" }),
      input("类型筛选", "角色 / 场景 / 道具 / 服装", 18, 58, 210),
      input("图像模型", "midjourney-private", 18, 130, 210),
      button("润色提示词", 18, 216, 210, "secondary"),
      button("批量生成图片", 18, 264, 210, "primary"),
      progressBar(18, 326, 210, 0.52, "warning"),
      txt("12 个资产中 7 个已生成候选图，2 个失败不阻塞整批任务。", 18, 350, 210, { size: 12, fill: C.secondary }),
    ] }),
    rect(366, 142, 594, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("塑造资产", 20, 16, 160, { size: 16, weight: "700" }),
      button("提取资产", 356, 10, 92, "secondary"),
      button("新增资产", 462, 10, 92, "primary"),
      rect(20, 62, 164, 212, C.raised, { r: 8, stroke: C.border, children: [
        rect(14, 14, 136, 88, C.inverseRaised, { r: 6 }),
        txt("阿令", 14, 116, 120, { size: 14, weight: "700" }),
        pill("canonical", 14, 142, "success", 92),
        txt("character | 4 versions", 14, 174, 132, { size: 11, fill: C.secondary }),
      ] }),
      rect(208, 62, 164, 212, C.raised, { r: 8, stroke: C.border, children: [
        rect(14, 14, 136, 88, C.inverseRaised, { r: 6 }),
        txt("旧宅回廊", 14, 116, 120, { size: 14, weight: "700" }),
        pill("locked", 14, 142, "success", 82),
        txt("scene | EP03 refs 5", 14, 174, 132, { size: 11, fill: C.secondary }),
      ] }),
      rect(396, 62, 164, 212, C.raised, { r: 8, stroke: C.border, children: [
        rect(14, 14, 136, 88, C.warningSoft, { r: 6 }),
        txt("金线", 14, 116, 120, { size: 14, weight: "700" }),
        pill("license ?", 14, 142, "warning", 86),
        txt("prop | source unknown", 14, 174, 132, { size: 11, fill: C.secondary }),
      ] }),
      tableRow(["资产", "类型", "版本", "引用", "授权"], 20, 318, [150, 90, 90, 120, 110], { header: true }),
      tableRow(["夜行衣", "costume", "3", "T02,T03", "user_owned"], 20, 356, [150, 90, 90, 120, 110]),
      tableRow(["港口灯牌", "prop", "2", "T04", "unknown"], 20, 394, [150, 90, 90, 120, 110]),
    ] }),
    rect(984, 142, 360, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("资产详情：阿令", 18, 16, 220, { size: 16, weight: "700" }),
      pill("character", 244, 14, "neutral", 92),
      rect(18, 58, 324, 150, C.inverse, { r: 8, children: [
        txt("主参考图", 18, 18, 180, { size: 13, fill: C.inverseText, weight: "700" }),
        txt("AssetVersion av-aling-04", 18, 44, 200, { size: 12, fill: C.muted, font: "IBM Plex Mono" }),
      ] }),
      checkRow("来源记录", "generated_provider_terms，prompt 可追溯", "passed", 18, 228, 324),
      checkRow("Track 引用", "EP03 T01,T02,T03 精确引用 av-04", "passed", 18, 298, 324),
      checkRow("导出授权", "可导出，但需附供应商条款提示", "warning", 18, 368, 324),
      txt("版本画廊", 18, 466, 160, { size: 14, weight: "700" }),
      rect(18, 498, 92, 74, C.successSoft, { r: 6, stroke: C.success }),
      rect(126, 498, 92, 74, C.raised, { r: 6, stroke: C.border }),
      rect(234, 498, 92, 74, C.dangerSoft, { r: 6, stroke: C.danger }),
      button("设为主参考", 178, 650, 116, "primary"),
      button("归档失败版本", 18, 650, 138, "secondary"),
    ] }),
  ];
  return shell("assets", "塑造", "资产卡片必须同时承载图片、版本、授权、引用和质量状态。", "assets", "上传素材", content);
}

function productionScreen() {
  const nodes = [
    rect(96, 142, 784, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("制作工作台 / EP03", 20, 16, 240, { size: 17, weight: "700" }),
      pill("budget within", 640, 16, "success", 116),
      rect(20, 58, 744, 78, C.raised, { r: 8, stroke: C.border, children: [
        pill("A completed", 16, 26, "success", 100),
        pill("B partial", 126, 26, "warning", 82),
        pill("C1 completed", 218, 26, "success", 108),
        pill("C2 completed", 336, 26, "success", 108),
        pill("C3 stale", 454, 26, "warning", 88),
        pill("D running", 552, 26, "info", 92),
        pill("E pending", 654, 26, "neutral", 78),
      ] }),
      txt("D Track 视频生成", 20, 158, 240, { size: 16, weight: "700" }),
      tableRow(["Track", "目标", "策略", "依赖", "Take", "成本"], 20, 194, [74, 178, 146, 150, 100, 96], { header: true }),
      tableRow(["T01", "推门进入旧宅", "start_frame", "ready", "locked", "$4.20"], 20, 232, [74, 178, 146, 150, 100, 96]),
      tableRow(["T02", "金线沿地面移动", "multi_keyframe", "ready", "accepted", "$6.80"], 20, 270, [74, 178, 146, 150, 100, 96]),
      rect(20, 318, 744, 246, C.raised, { r: 8, stroke: C.strong, children: [
        txt("T03 夜市追逐前半段", 16, 14, 250, { size: 15, weight: "700" }),
        pill("preparing_inputs", 286, 12, "warning", 136),
        pill("start_frame", 436, 12, "info", 100),
        txt("TrackSegment", 16, 54, 140, { size: 12, fill: C.muted, weight: "700" }),
        tableRow(["时间", "画面目标", "动作/镜头", "资产引用"], 16, 82, [72, 214, 210, 214], { header: true }),
        tableRow(["0-2s", "阿令侧身躲避", "手持镜头后退", "阿令 av-04"], 16, 120, [72, 214, 210, 214]),
        tableRow(["2-6s", "冲入巷口", "低机位跟拍", "旧宅 sc-03"], 16, 158, [72, 214, 210, 214]),
        tableRow(["6-9s", "回头确认追兵", "近景停顿", "夜行衣 cv-02"], 16, 196, [72, 214, 210, 214]),
      ] }),
      rect(20, 586, 360, 130, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("策略依赖清单", 16, 14, 180, { size: 14, weight: "700", fill: C.warning }),
        txt("首帧候选未锁定；视频模型支持首帧但不支持首尾帧。", 16, 44, 300, { size: 12, fill: C.secondary }),
        button("生成首帧", 16, 82, 96, "primary"),
        button("上传替换", 128, 82, 96, "secondary"),
      ] }),
      rect(404, 586, 360, 130, C.panel, { r: 8, stroke: C.border, children: [
        txt("生成前成本估算", 16, 14, 180, { size: 14, weight: "700" }),
        txt("视频 9s + 首帧 1 张 + 最大重试 2 次", 16, 44, 260, { size: 12, fill: C.secondary }),
        progressBar(16, 82, 260, 0.68, "warning"),
        txt("$8.10 估算", 292, 76, 50, { size: 12, fill: C.warning, font: "IBM Plex Mono" }),
      ] }),
    ] }),
    agentPanel(904, 142, 440, 748, "Production Agent"),
  ];
  return shell("pipeline", "制作工作台", "A-E 管线为底层状态机，D 阶段以 Track 展开控制。", "pipeline", "提交批量任务", nodes);
}

function autoRunScreen() {
  const modeCards = [
    ["1", "A→C3 自动运行", "章节解析、AgentRun、ScriptVersion、PromptPack 自动推进。", "success"],
    ["2", "C3 完成确认", "展示 PromptPack 差异和进入 D 阶段的人工确认。", "info"],
    ["3", "D 提交前确认", "进入路径 5，先核对 Track、资产、成本与策略。", "warning"],
    ["4", "D 任务执行", "Track task grid 与事件流持续反馈执行进度。", "info"],
    ["5", "D 完成，引导路径 4", "锁定 take 后回到粗剪交付，生成单集交付包。", "success"],
  ];
  const nodes = [
    rect(96, 142, 350, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("自动管线模式", 20, 18, 180, { size: 17, weight: "700" }),
      txt("自动推进不是隐藏状态，所有停顿点都需要原因和下一步。", 20, 48, 286, { size: 12, fill: C.secondary }),
      ...modeCards.flatMap((mode, i) => [
        rect(20, 92 + i * 104, 310, 90, i === 3 ? C.blueSoft : C.raised, { r: 8, stroke: i === 3 ? C.blueSoft : C.border, children: [
          txt(`模式 ${mode[0]}`, 14, 12, 76, { size: 12, font: "IBM Plex Mono", fill: C.muted, weight: "700" }),
          pill(i === 3 ? "running" : i < 3 ? "done" : "next", 214, 10, mode[3], 78),
          txt(mode[1], 14, 34, 190, { size: 14, weight: "700" }),
          txt(mode[2], 14, 54, 258, { size: 11, fill: C.secondary }),
        ] }),
      ]),
      rect(20, 632, 310, 78, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("Owner 停顿点", 14, 12, 180, { size: 14, weight: "700", fill: C.warning }),
        txt("C3 完成、D 提交、成本超限和豁免都需要明确确认。", 14, 40, 260, { size: 12, fill: C.secondary }),
      ] }),
    ] }),
    rect(470, 142, 570, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("当前运行：模式 4 / D 阶段任务执行", 22, 18, 360, { size: 18, weight: "700" }),
      pill("auto_run_id ar-2026-EP03", 358, 18, "neutral", 172),
      txt("从 C3 PromptPack 锁定后进入 D，批量任务由路径 5 的确认结果生成。", 22, 50, 430, { size: 12, fill: C.secondary }),
      rect(22, 88, 526, 82, C.inverse, { r: 8, stroke: C.inverse, children: [
        txt("A", 22, 26, 26, { size: 18, weight: "700", fill: C.inverseText }),
        progressBar(58, 36, 92, 1, "success"),
        txt("B", 172, 26, 26, { size: 18, weight: "700", fill: C.inverseText }),
        progressBar(208, 36, 92, 1, "success"),
        txt("C3", 322, 26, 38, { size: 18, weight: "700", fill: C.inverseText }),
        progressBar(368, 36, 92, 0.62, "warning"),
        txt("D", 482, 26, 26, { size: 18, weight: "700", fill: C.inverseText }),
      ] }),
      tableRow(["Track", "策略", "依赖", "任务状态", "成本"], 22, 206, [86, 122, 118, 126, 74], { header: true }),
      tableRow(["T01", "start_frame", "ready", "done", "$4.20"], 22, 244, [86, 122, 118, 126, 74]),
      tableRow(["T02", "multi_key", "ready", "running", "$6.80"], 22, 282, [86, 122, 118, 126, 74]),
      tableRow(["T03", "start_frame", "missing", "blocked", "$0"], 22, 320, [86, 122, 118, 126, 74]),
      tableRow(["T04", "text_only", "ready", "queued", "$2.10"], 22, 358, [86, 122, 118, 126, 74]),
      rect(22, 424, 250, 142, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("阻塞解释", 16, 14, 180, { size: 14, weight: "700", fill: C.warning }),
        txt("T03 缺少 locked 首帧，不能自动提交视频任务。", 16, 44, 194, { size: 12, fill: C.secondary }),
        button("打开路径 5", 16, 90, 104, "primary"),
      ] }),
      rect(298, 424, 250, 142, C.raised, { r: 8, stroke: C.border, children: [
        txt("自动恢复", 16, 14, 180, { size: 14, weight: "700" }),
        txt("重复任务使用 requestHash 拦截；远端状态进入 reconciling。", 16, 44, 200, { size: 12, fill: C.secondary }),
        pill("duplicate_blocked", 16, 94, "warning", 146),
      ] }),
      rect(22, 604, 526, 94, C.infoSoft, { r: 8, stroke: C.infoSoft, children: [
        txt("模式 5 预告", 16, 14, 180, { size: 14, weight: "700", fill: C.info }),
        txt("D 全部完成后自动引导到路径 4 / E 粗剪交付，并显示 EpisodeDeliveryPackage 准备度。", 16, 44, 450, { size: 12, fill: C.secondary }),
      ] }),
    ] }),
    rect(1064, 142, 280, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("事件流", 18, 18, 150, { size: 17, weight: "700" }),
      pill("live", 204, 18, "success", 56),
      txt("20:14  T02 providerJobId sd_2481", 18, 62, 230, { size: 12, font: "IBM Plex Mono", fill: C.secondary }),
      txt("20:13  T03 blocked_by_missing_input", 18, 100, 230, { size: 12, font: "IBM Plex Mono", fill: C.warning }),
      txt("20:10  C3 PromptPack locked", 18, 138, 230, { size: 12, font: "IBM Plex Mono", fill: C.secondary }),
      txt("20:06  AgentRun completed", 18, 176, 230, { size: 12, font: "IBM Plex Mono", fill: C.secondary }),
      line(18, 228, 244),
      metric("队列", "4", 18, 260, 112, "info"),
      metric("阻塞", "1", 150, 260, 112, "warning"),
      metric("估算成本", "$13", 18, 398, 244, "warning"),
      button("暂停自动运行", 18, 566, 122, "secondary"),
      button("进入路径 5", 152, 566, 110, "primary"),
    ] }),
  ];
  return shell("pipeline", "自动管线运行视图", "A 到 D 的自动推进必须透明、可暂停、可恢复，并暴露所有人工确认点。", "pipeline", "暂停运行", nodes);
}

function path5Screen() {
  const nodes = [
    rect(96, 142, 800, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("路径 5：D 阶段视频生成确认与批量提交", 22, 18, 460, { size: 18, weight: "700" }),
      pill("submit gate", 654, 18, "warning", 110),
      txt("此页面在 D 阶段提交前出现，确认 Track、策略、资产、成本、重试和质量协议后再批量提交。", 22, 50, 620, { size: 12, fill: C.secondary }),
      rect(22, 92, 240, 158, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("提交前确认", 16, 14, 180, { size: 15, weight: "700", fill: C.warning }),
        rect(16, 50, 208, 40, C.panel, { r: 6, stroke: C.border, children: [
          pill("passed", 10, 10, "success", 76),
          txt("PromptPack 已锁定", 96, 12, 96, { size: 12, fill: C.secondary }),
        ] }),
        rect(16, 102, 208, 40, C.panel, { r: 6, stroke: C.border, children: [
          pill("warning", 10, 10, "warning", 82),
          txt("T03 首帧待锁定", 100, 12, 92, { size: 12, fill: C.secondary }),
        ] }),
      ] }),
      rect(282, 92, 240, 158, C.raised, { r: 8, stroke: C.border, children: [
        txt("策略摘要", 16, 14, 180, { size: 15, weight: "700" }),
        pill("start_frame", 16, 52, "info", 104),
        pill("multi_keyframe", 130, 52, "neutral", 110),
        txt("模型能力不匹配时显示降级原因，不能静默替换。", 16, 96, 188, { size: 12, fill: C.secondary }),
      ] }),
      rect(542, 92, 230, 158, C.raised, { r: 8, stroke: C.border, children: [
        txt("批量提交预算", 16, 14, 180, { size: 15, weight: "700" }),
        txt("$18.40", 16, 56, 110, { size: 26, weight: "700", font: "IBM Plex Mono" }),
        progressBar(16, 106, 172, 0.74, "warning"),
        txt("上限 $25", 16, 126, 120, { size: 11, fill: C.secondary }),
      ] }),
      tableRow(["选择", "Track", "视频目标", "策略", "依赖", "提交"], 22, 294, [70, 88, 220, 140, 128, 116], { header: true }),
      tableRow(["✓", "T01", "推门进入旧宅", "start_frame", "ready", "submit"], 22, 332, [70, 88, 220, 140, 128, 116]),
      tableRow(["✓", "T02", "金线沿地面移动", "multi_key", "ready", "submit"], 22, 370, [70, 88, 220, 140, 128, 116]),
      tableRow(["!", "T03", "夜市追逐前半段", "start_frame", "missing", "blocked"], 22, 408, [70, 88, 220, 140, 128, 116]),
      tableRow(["✓", "T04", "巷尾回身对峙", "text_only", "ready", "submit"], 22, 446, [70, 88, 220, 140, 128, 116]),
      rect(22, 520, 360, 160, C.infoSoft, { r: 8, stroke: C.infoSoft, children: [
        txt("批量提交参数", 16, 14, 180, { size: 14, weight: "700", fill: C.info }),
        input("最大并发", "2", 16, 46, 100),
        input("最大重试", "2", 136, 46, 100),
        input("失败策略", "pause_on_quality_failed", 16, 100, 300),
      ] }),
      rect(410, 520, 362, 160, C.dangerSoft, { r: 8, stroke: C.dangerSoft, children: [
        txt("禁止静默提交", 16, 14, 190, { size: 14, weight: "700", fill: C.danger }),
        txt("缺少输入、成本超限、质量协议未通过时，批量按钮禁用并贴近修复入口。", 16, 46, 296, { size: 12, fill: C.secondary }),
        button("修复 T03 首帧", 16, 92, 120, "primary"),
      ] }),
    ] }),
    rect(920, 142, 424, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("提交结果预览", 20, 18, 220, { size: 17, weight: "700" }),
      txt("点击批量提交前先展示会创建的 Task 记录和 requestHash。", 20, 48, 330, { size: 12, fill: C.secondary }),
      tableRow(["Task", "Track", "requestHash"], 20, 92, [96, 84, 204], { header: true }),
      tableRow(["tk-501", "T01", "rh_84a9"], 20, 130, [96, 84, 204]),
      tableRow(["tk-502", "T02", "rh_5db2"], 20, 168, [96, 84, 204]),
      tableRow(["blocked", "T03", "missing_input"], 20, 206, [96, 84, 204]),
      rect(20, 286, 384, 170, C.raised, { r: 8, stroke: C.border, children: [
        txt("质量协议绑定", 16, 14, 190, { size: 14, weight: "700" }),
        pill("character_consistency", 16, 52, "neutral", 162),
        pill("duration_bounds", 190, 52, "neutral", 128),
        pill("artifact_integrity", 16, 94, "neutral", 140),
      ] }),
      rect(20, 492, 384, 126, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("Owner 确认", 16, 14, 190, { size: 14, weight: "700", fill: C.warning }),
        txt("批量提交会产生远端成本；确认后写入 AuditLog。", 16, 44, 300, { size: 12, fill: C.secondary }),
      ] }),
      button("取消", 176, 670, 86, "secondary"),
      button("确认并提交", 278, 670, 110, "primary"),
    ] }),
  ];
  return shell("pipeline", "路径 5：D 阶段视频生成确认", "批量提交前把风险、成本、缺口和质量协议放在同一决策面。", "pipeline", null, nodes);
}

function ipTimelineScreen() {
  const nodes = [
    rect(96, 142, 1248, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("跨集 IP 资产时间线", 22, 18, 300, { size: 18, weight: "700" }),
      txt("追踪角色、服装、场景和道具在不同 Episode 的 canonicalVersion、漂移风险和复用状态。", 22, 50, 660, { size: 12, fill: C.secondary }),
      pill("project scope", 1048, 18, "neutral", 112),
      tableRow(["IP 资产", "EP01", "EP02", "EP03", "EP04", "漂移风险", "canonical"], 22, 100, [170, 130, 130, 130, 130, 150, 140], { header: true }),
      tableRow(["阿令 / character", "v01", "v02", "v04", "planned", "medium", "av-04"], 22, 138, [170, 130, 130, 130, 130, 150, 140]),
      tableRow(["夜行衣 / costume", "n/a", "cv-01", "cv-02", "cv-02", "low", "cv-02"], 22, 176, [170, 130, 130, 130, 130, 150, 140]),
      tableRow(["旧宅 / scene", "sc-01", "sc-03", "sc-03", "reuse", "low", "sc-03"], 22, 214, [170, 130, 130, 130, 130, 150, 140]),
      tableRow(["金线 / prop", "pp-01", "pp-01", "pp-02", "review", "high", "pp-02"], 22, 252, [170, 130, 130, 130, 130, 150, 140]),
      rect(22, 336, 560, 238, C.raised, { r: 8, stroke: C.border, children: [
        txt("时间线可视化", 18, 16, 200, { size: 15, weight: "700" }),
        txt("EP01", 112, 54, 70, { size: 11, fill: C.muted, align: "center" }),
        txt("EP02", 226, 54, 70, { size: 11, fill: C.muted, align: "center" }),
        txt("EP03", 340, 54, 70, { size: 11, fill: C.muted, align: "center" }),
        txt("EP04", 454, 54, 70, { size: 11, fill: C.muted, align: "center" }),
        rect(112, 92, 70, 16, C.success, { r: 8 }),
        rect(226, 92, 184, 16, C.warning, { r: 8 }),
        rect(112, 132, 298, 16, C.info, { r: 8 }),
        rect(226, 172, 298, 16, C.success, { r: 8 }),
        txt("character 阿令", 18, 86, 86, { size: 12, fill: C.secondary }),
        txt("costume 夜行衣", 18, 126, 86, { size: 12, fill: C.secondary }),
        txt("scene 旧宅", 18, 166, 86, { size: 12, fill: C.secondary }),
      ] }),
      rect(610, 336, 300, 238, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("漂移提醒", 18, 16, 160, { size: 15, weight: "700", fill: C.warning }),
        txt("金线道具 EP03 使用 pp-02，但 EP04 计划引用 pp-01，进入制作前需要确认。", 18, 52, 238, { size: 12, fill: C.secondary }),
        button("打开差异", 18, 148, 94, "primary"),
      ] }),
      rect(940, 336, 278, 238, C.raised, { r: 8, stroke: C.border, children: [
        txt("版本锚点", 18, 16, 160, { size: 15, weight: "700" }),
        pill("canonical av-04", 18, 54, "success", 126),
        pill("license checked", 18, 96, "success", 128),
        pill("used by 9 tracks", 18, 138, "neutral", 130),
      ] }),
      rect(22, 622, 1196, 74, C.infoSoft, { r: 8, stroke: C.infoSoft, children: [
        txt("生产含义", 18, 14, 180, { size: 14, weight: "700", fill: C.info }),
        txt("资产时间线不是图库列表，它决定 D 阶段引用是否可复用、是否 stale，以及是否需要重新生成首帧。", 18, 42, 760, { size: 12, fill: C.secondary }),
      ] }),
    ] }),
  ];
  return shell("assets", "跨集 IP 资产时间线", "从项目维度检查资产连续性，避免短剧多集生产中的角色和道具漂移。", null, "新建资产版本", nodes);
}

function qualityProtocolScreen() {
  const nodes = [
    rect(96, 142, 1248, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("质量评估协议", 22, 18, 260, { size: 18, weight: "700" }),
      txt("把 Product-Spec 中的质量规则直接落在 D 阶段、Take 审核和 E 交付前检查上。", 22, 50, 620, { size: 12, fill: C.secondary }),
      rect(22, 92, 380, 252, C.raised, { r: 8, stroke: C.border, children: [
        txt("视频生成质量项", 18, 16, 200, { size: 15, weight: "700" }),
        checkRow("角色一致性", "脸型、服装、关键道具不漂移", "warning", 18, 58, 342),
        checkRow("时长边界", "TrackSegment 9s 内完成动作", "passed", 18, 128, 342),
        checkRow("镜头目标", "动作/景别/运动方向可识别", "passed", 18, 190, 342),
      ] }),
      rect(434, 92, 380, 252, C.raised, { r: 8, stroke: C.border, children: [
        txt("Artifact 完整性", 18, 16, 200, { size: 15, weight: "700" }),
        checkRow("hash", "Artifact hash 完整", "passed", 18, 58, 342),
        checkRow("license", "2 个素材授权 unknown", "warning", 18, 128, 342),
        checkRow("SecretRef", "导出前必须排除密钥", "passed", 18, 190, 342),
      ] }),
      rect(846, 92, 372, 252, C.raised, { r: 8, stroke: C.border, children: [
        txt("人工豁免", 18, 16, 200, { size: 15, weight: "700" }),
        txt("豁免不是通过。必须记录原因、操作者、范围和过期条件。", 18, 50, 288, { size: 12, fill: C.secondary }),
        input("豁免原因", "服装细节轻微漂移，不影响剧情理解", 18, 94, 320),
        pill("waived by owner", 18, 166, "info", 132),
      ] }),
      rect(22, 390, 576, 230, C.dangerSoft, { r: 8, stroke: C.dangerSoft, children: [
        txt("阻塞规则", 18, 16, 180, { size: 15, weight: "700", fill: C.danger }),
        tableRow(["规则", "触发", "结果"], 18, 58, [170, 210, 150], { header: true }),
        tableRow(["compliance_failed", "含敏感或禁用素材", "阻止导出"], 18, 96, [170, 210, 150]),
        tableRow(["blocked_by_budget", "成本超过 Episode 上限", "Owner 确认"], 18, 134, [170, 210, 150]),
        tableRow(["missing_input", "缺首帧/资产/PromptPack", "回到修复入口"], 18, 172, [170, 210, 150]),
      ] }),
      rect(626, 390, 592, 230, C.infoSoft, { r: 8, stroke: C.infoSoft, children: [
        txt("协议输出", 18, 16, 180, { size: 15, weight: "700", fill: C.info }),
        txt("QualityReport 绑定 Track、Take、Artifact、Task 与 EpisodeDeliveryPackage。", 18, 50, 480, { size: 12, fill: C.secondary }),
        tableRow(["对象", "状态", "下一步"], 18, 92, [150, 130, 260], { header: true }),
        tableRow(["T03 take-03A", "warning", "允许 Owner 豁免或重试"], 18, 130, [150, 130, 260]),
        tableRow(["EP03 package", "blocked", "等待 T05 locked take"], 18, 168, [150, 130, 260]),
      ] }),
      button("保存协议模板", 970, 666, 124, "secondary"),
      button("应用到本集", 1110, 666, 108, "primary"),
    ] }),
  ];
  return shell("pipeline", "质量评估协议", "质量门禁必须能解释、能豁免、能阻塞，并同步到导出报告。", "take", null, nodes);
}

function roughCutScreen() {
  const nodes = [
    rect(96, 142, 530, 748, C.inverse, { r: 8, stroke: C.inverse, children: [
      txt("Take 审核", 22, 20, 220, { size: 17, weight: "700", fill: C.inverseText }),
      pill("T03 selected", 372, 18, "inverse", 110),
      rect(22, 64, 486, 284, C.inverseRaised, { r: 8, stroke: C.strong, children: [
        txt("视频预览 00:00-00:09", 24, 24, 260, { size: 14, fill: C.inverseText, weight: "700" }),
        txt("局部深色媒体面板，只服务审片聚焦。", 24, 58, 320, { size: 12, fill: C.muted }),
        rect(204, 118, 80, 80, C.panel, { r: 40, opacity: 0.16 }),
      ] }),
      rect(22, 376, 486, 112, C.inverseRaised, { r: 8, stroke: C.strong, children: [
        txt("take-03A", 16, 14, 120, { size: 13, font: "IBM Plex Mono", fill: C.inverseText, weight: "700" }),
        pill("accepted", 340, 12, "success", 92),
        txt("动作准确，服装细节轻微漂移。成本 $2.70。", 16, 44, 360, { size: 12, fill: C.muted }),
      ] }),
      rect(22, 506, 486, 112, C.inverseRaised, { r: 8, stroke: C.strong, children: [
        txt("take-03B", 16, 14, 120, { size: 13, font: "IBM Plex Mono", fill: C.inverseText, weight: "700" }),
        pill("rejected", 340, 12, "danger", 92),
        txt("问题类型：character_drift / duration_error。", 16, 44, 360, { size: 12, fill: C.muted }),
      ] }),
      button("锁定 take", 378, 670, 112, "primary"),
      button("按问题重试", 242, 670, 118, "secondary"),
    ] }),
    rect(650, 142, 694, 748, C.panel, { r: 8, stroke: C.border, children: [
      txt("E 粗剪交付", 22, 18, 200, { size: 17, weight: "700" }),
      pill("ready_for_preview", 500, 16, "info", 142),
      txt("RoughCut 只读取 locked take，未锁定 Track 显示为缺口。", 22, 50, 420, { size: 12, fill: C.secondary }),
      tableRow(["顺序", "Track", "Take", "状态", "音频/字幕"], 22, 90, [56, 128, 128, 96, 242], { header: true }),
      tableRow(["01", "T01 推门", "take-01C", "locked", "旁白 2.1s"], 22, 128, [56, 128, 128, 96, 242]),
      tableRow(["02", "T02 金线", "take-02A", "locked", "无对白，音效"], 22, 166, [56, 128, 128, 96, 242]),
      tableRow(["03", "T03 追逐", "take-03A", "accepted", "对白待确认"], 22, 204, [56, 128, 128, 96, 242]),
      rect(22, 268, 310, 170, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("缺口列表", 16, 14, 180, { size: 14, weight: "700", fill: C.warning }),
        txt("T03 未锁定，T05 缺失 Artifact，C3 PromptPack stale。", 16, 44, 260, { size: 12, fill: C.secondary }),
      ] }),
      rect(356, 268, 310, 170, C.raised, { r: 8, stroke: C.border, children: [
        txt("AudioSubtitlePlan", 16, 14, 180, { size: 14, weight: "700" }),
        txt("TrackSegment 级台词、旁白、嘴型和音效计划。", 16, 44, 250, { size: 12, fill: C.secondary }),
        pill("version asp-03-02", 16, 104, "neutral", 134),
      ] }),
      checkRow("粗剪质量门禁", "T03 可人工豁免，但需原因", "warning", 22, 472, 644),
      checkRow("导出前检查", "SecretRef 排除，Artifact hash 完整", "passed", 22, 542, 644),
      button("生成粗剪预览", 398, 666, 124, "secondary"),
      button("导出单集交付包", 510, 666, 156, "primary"),
    ] }),
  ];
  return shell("pipeline", "Take 审核与 E 粗剪交付", "视频审片局部深色，EpisodeDeliveryPackage 只服务单集成片交付。", "take", null, nodes);
}

function taskCenterScreen() {
  const nodes = [
    rect(96, 104, 1248, 786, C.panel, { r: 8, stroke: C.border, children: [
      txt("任务中心", 22, 18, 220, { size: 18, weight: "700" }),
      txt("本地 Task、远端 providerJobId、恢复状态、成本与重试。", 22, 48, 480, { size: 12, fill: C.secondary }),
      metric("运行中", "7", 22, 88, 160, "warning"),
      metric("已对账", "128", 200, 88, 160, "success"),
      metric("失败成本", "$21", 378, 88, 160, "danger"),
      metric("重复拦截", "3", 556, 88, 160, "warning"),
      tableRow(["Task", "对象", "providerJobId", "状态", "恢复", "成本", "操作"], 22, 198, [116, 190, 180, 130, 160, 110, 160], { header: true }),
      tableRow(["tk-481", "EP03 T03 首帧", "img_8842", "running", "normal", "$0.30", "查看"], 22, 236, [116, 190, 180, 130, 160, 110, 160]),
      tableRow(["tk-482", "EP03 T03 视频", "sd_2481", "reconciling", "reconnecting", "$2.70", "对账"], 22, 274, [116, 190, 180, 130, 160, 110, 160]),
      tableRow(["tk-483", "EP04 T01", "sd_2481", "paused", "duplicate_blocked", "$0", "恢复"], 22, 312, [116, 190, 180, 130, 160, 110, 160]),
      tableRow(["tk-484", "ExportPackage", "local", "failed", "orphaned", "$0", "重试"], 22, 350, [116, 190, 180, 130, 160, 110, 160]),
      rect(22, 430, 370, 220, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("重复任务拦截", 16, 16, 240, { size: 15, weight: "700", fill: C.warning }),
        txt("检测到等价 requestHash 已提交，当前操作进入 duplicate_blocked，避免重复扣费。", 16, 48, 310, { size: 12, fill: C.secondary }),
        button("查看原任务", 16, 148, 110, "secondary"),
      ] }),
      rect(418, 430, 370, 220, C.raised, { r: 8, stroke: C.border, children: [
        txt("成本复盘", 16, 16, 200, { size: 15, weight: "700" }),
        progressBar(16, 60, 300, 0.78, "warning"),
        txt("start_frame 策略贡献 42% 成本，first_last_frame 平均重试更高。", 16, 94, 310, { size: 12, fill: C.secondary }),
      ] }),
      rect(814, 430, 370, 220, C.dangerSoft, { r: 8, stroke: C.dangerSoft, children: [
        txt("失败恢复", 16, 16, 200, { size: 15, weight: "700", fill: C.danger }),
        txt("providerJobId 有结果但 Artifact 丢失。需要重新下载或标记 failed。", 16, 48, 300, { size: 12, fill: C.secondary }),
        button("重新拉取", 16, 148, 98, "primary"),
      ] }),
    ] }),
  ];
  return shell("tasks", "任务中心", "异步任务可恢复、可对账、可止损。", null, "刷新状态", nodes);
}

function settingsScreen() {
  const nodes = [
    rect(96, 104, 1248, 786, C.panel, { r: 8, stroke: C.border, children: [
      txt("设置与治理", 22, 18, 220, { size: 18, weight: "700" }),
      txt("ProviderConfig、ModelConfig、SecretRef、访问凭据、RuntimeCheck 和审计日志。", 22, 48, 620, { size: 12, fill: C.secondary }),
      rect(22, 92, 380, 260, C.raised, { r: 8, stroke: C.border, children: [
        txt("ProviderConfig", 16, 16, 180, { size: 15, weight: "700" }),
        tableRow(["供应商", "状态", "能力"], 16, 58, [130, 92, 120], { header: true }),
        tableRow(["ByteDance", "enabled", "video"], 16, 96, [130, 92, 120]),
        tableRow(["Private GW", "failed", "mixed"], 16, 134, [130, 92, 120]),
        button("测试连接", 16, 202, 102, "secondary"),
        button("新增供应商", 132, 202, 112, "primary"),
      ] }),
      rect(430, 92, 380, 260, C.raised, { r: 8, stroke: C.border, children: [
        txt("ModelConfig", 16, 16, 180, { size: 15, weight: "700" }),
        tableRow(["模型", "类型", "状态"], 16, 58, [168, 74, 100], { header: true }),
        tableRow(["qwen3-max", "language", "enabled"], 16, 96, [168, 74, 100]),
        tableRow(["seedance-2.0", "video", "enabled"], 16, 134, [168, 74, 100]),
        tableRow(["wan-image", "image", "disabled"], 16, 172, [168, 74, 100]),
      ] }),
      rect(838, 92, 380, 260, C.raised, { r: 8, stroke: C.border, children: [
        txt("SecretRef 安全区", 16, 16, 200, { size: 15, weight: "700" }),
        txt("密钥不可见、不可复制明文；只显示作用域、过期时间和最近使用。", 16, 46, 310, { size: 12, fill: C.secondary }),
        checkRow("video/provider/token", "scope: task.submit | last used 20:14", "passed", 16, 96, 342),
        checkRow("private-gw/key", "connection_failed，需要轮换或修复", "failed", 16, 166, 342),
      ] }),
      rect(22, 384, 380, 282, C.panel, { r: 8, stroke: C.border, children: [
        txt("RuntimeCheck", 16, 16, 180, { size: 15, weight: "700" }),
        checkRow("dataRoot", "/toonflow-data 可读写", "passed", 16, 58, 342),
        checkRow("ffmpeg", "版本可用，支持范围请求", "passed", 16, 128, 342),
        checkRow("Private Gateway", "连接失败，D 阶段不可选", "failed", 16, 198, 342),
      ] }),
      rect(430, 384, 380, 282, C.panel, { r: 8, stroke: C.border, children: [
        txt("访问凭据", 16, 16, 180, { size: 15, weight: "700" }),
        input("访问模式", "localhost / lan / private_server", 16, 58, 342),
        input("Operator", "owner: baodong", 16, 130, 342),
        button("启用局域网访问", 16, 218, 134, "secondary"),
      ] }),
      rect(838, 384, 380, 282, C.panel, { r: 8, stroke: C.border, children: [
        txt("审计日志", 16, 16, 180, { size: 15, weight: "700" }),
        tableRow(["时间", "操作", "对象"], 16, 58, [86, 120, 136], { header: true }),
        tableRow(["20:14", "waive", "T03 gate"], 16, 96, [86, 120, 136]),
        tableRow(["19:48", "export", "EP03 pkg"], 16, 134, [86, 120, 136]),
        tableRow(["19:21", "rotate", "SecretRef"], 16, 172, [86, 120, 136]),
      ] }),
    ] }),
  ];
  return shell("settings", "设置", "技术配置安静可诊断，安全操作有明确边界。", null, "保存设置", nodes);
}

function legacyImportScreen() {
  const nodes = [
    rect(180, 128, 1080, 720, C.panel, { r: 8, stroke: C.border, children: [
      txt("Legacy Import 导入向导", 30, 28, 420, { size: 22, weight: "700" }),
      txt("只读扫描旧 novels 目录，预览映射后才创建新 Project。", 30, 64, 600, { size: 13, fill: C.secondary }),
      pill("read-only scan", 884, 30, "success", 124),
      rect(30, 110, 1020, 70, C.raised, { r: 8, stroke: C.border, children: [
        pill("1 扫描", 24, 23, "success", 86),
        pill("2 预览", 134, 23, "success", 86),
        pill("3 映射", 244, 23, "info", 86),
        pill("4 导入", 354, 23, "neutral", 86),
        pill("5 校验", 464, 23, "neutral", 86),
      ] }),
      tableRow(["旧路径", "识别对象", "新对象", "状态"], 30, 218, [300, 230, 250, 180], { header: true }),
      tableRow(["novels/wuhai/chapters", "48 chapters", "SourceDocument + Chapter", "mapped"], 30, 256, [300, 230, 250, 180]),
      tableRow(["novels/wuhai/assets", "12 images", "Artifact + AssetVersion", "license unknown"], 30, 294, [300, 230, 250, 180]),
      tableRow(["novels/wuhai/seedance", "31 videos", "Take + Task", "needs review"], 30, 332, [300, 230, 250, 180]),
      rect(30, 408, 480, 150, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
        txt("冲突与不可解析项", 18, 16, 220, { size: 15, weight: "700", fill: C.warning }),
        txt("2 个视频缺少任务记录；3 个图片 license unknown；1 个脚本无法映射 Episode。", 18, 50, 400, { size: 12, fill: C.secondary }),
      ] }),
      rect(540, 408, 510, 150, C.infoSoft, { r: 8, stroke: C.infoSoft, children: [
        txt("导入承诺", 18, 16, 220, { size: 15, weight: "700", fill: C.info }),
        txt("不会覆盖、删除或移动旧目录。导入结果写入新的后端工作空间和 Artifact 索引。", 18, 50, 430, { size: 12, fill: C.secondary }),
      ] }),
      button("上一步", 808, 628, 92, "secondary"),
      button("确认映射并导入", 916, 628, 134, "primary"),
    ] }),
  ];
  return shell("projects", "Legacy Import", "旧数据只作为迁移来源，不定义新产品心智。", null, null, nodes);
}

function exportScreen() {
  const nodes = [
    rect(180, 128, 1080, 720, C.panel, { r: 8, stroke: C.border, children: [
      txt("ProjectMigrationPackage 导出检查", 30, 28, 520, { size: 22, weight: "700" }),
      txt("设置降级路径只处理项目迁移与恢复包；单集成片由 EpisodeDeliveryPackage 负责。", 30, 64, 760, { size: 13, fill: C.secondary }),
      pill("preparing", 920, 30, "info", 100),
      rect(30, 112, 470, 230, C.raised, { r: 8, stroke: C.border, children: [
        txt("导出范围", 18, 16, 180, { size: 15, weight: "700" }),
        input("项目", "雾海金线", 18, 56, 205),
        input("集数", "EP03", 245, 56, 190),
        input("格式", "project data + manifest + artifact index", 18, 128, 417),
      ] }),
      rect(530, 112, 520, 230, C.raised, { r: 8, stroke: C.border, children: [
        txt("总体结论", 18, 16, 180, { size: 15, weight: "700" }),
        pill("可导出，含警告", 18, 52, "warning", 130),
        txt("将排除 SecretRef；EpisodeDeliveryPackage 不在此处导出；2 个授权 unknown 的素材会写入风险提示。", 18, 92, 440, { size: 12, fill: C.secondary }),
      ] }),
      checkRow("manifest", "schemaVersion、DB revision、Artifact hash 完整", "passed", 30, 382, 1020),
      checkRow("Artifact 完整性", "T05 缺失 locked take，作为缺口写入", "warning", 30, 452, 1020),
      checkRow("SecretRef 排除", "模型密钥、访问令牌不会进入导出包", "passed", 30, 522, 1020),
      checkRow("运行中任务", "2 个任务 running，导出会记录为 pending", "warning", 30, 592, 1020),
      button("取消", 818, 656, 92, "secondary"),
      button("生成迁移包", 928, 656, 122, "primary"),
    ] }),
  ];
  return shell("settings", "ProjectMigrationPackage", "导出、迁移和恢复的治理流程。", null, null, nodes);
}

function stateBoard() {
  const states = [
    ["默认 / 草稿", "draft", "neutral", "低强调，允许继续编辑。"],
    ["运行中", "running", "info", "进度、队列位置和取消入口并存。"],
    ["成功 / 锁定", "locked", "success", "结果可用且版本固定。"],
    ["警告 / stale", "stale", "warning", "可继续查看，推进前需确认。"],
    ["阻塞 / failed", "failed", "danger", "阻止推进并贴近修复入口。"],
    ["人工豁免", "waived", "info", "不是自动通过，必须显示原因。"],
    ["任务对账", "reconciling", "info", "系统正在整理远端状态。"],
    ["合规失败", "compliance_failed", "danger", "需要替换或强确认。"],
  ];
  const nodes = [rect(0, 0, W, H, C.canvas), txt("状态变体与异常语法", 48, 42, 520, { size: 28, weight: "700" }), txt("覆盖 loading、empty、error、blocked、waived、reconciling、over budget 和 compliance_failed。", 48, 82, 760, { size: 14, fill: C.secondary })];
  for (let i = 0; i < states.length; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 48 + col * 330;
    const y = 140 + row * 190;
    nodes.push(rect(x, y, 286, 150, C.panel, { r: 8, stroke: C.border, children: [
      txt(states[i][0], 18, 18, 220, { size: 15, weight: "700" }),
      pill(states[i][1], 18, 54, states[i][2], states[i][1].length > 12 ? 146 : 108),
      txt(states[i][3], 18, 96, 230, { size: 12, fill: C.secondary }),
    ] }));
  }
  nodes.push(rect(48, 554, 396, 220, C.panel, { r: 8, stroke: C.border, children: [
    txt("Loading", 18, 18, 180, { size: 16, weight: "700" }),
    rect(18, 64, 330, 18, C.raised, { r: 4 }),
    rect(18, 96, 260, 18, C.raised, { r: 4 }),
    progressBar(18, 142, 330, 0.42, "success"),
    txt("骨架屏 + 数量统计，不空白等待。", 18, 174, 300, { size: 12, fill: C.secondary }),
  ] }));
  nodes.push(rect(480, 554, 396, 220, C.panel, { r: 8, stroke: C.border, children: [
    txt("Error", 18, 18, 180, { size: 16, weight: "700" }),
    pill("blocked_by_budget", 18, 58, "danger", 154),
    txt("预计成本超过 Episode 上限，需要调整策略或 Owner 确认。", 18, 98, 320, { size: 12, fill: C.secondary }),
    button("调整策略", 18, 154, 94, "secondary"),
    button("Owner 确认", 126, 154, 106, "primary"),
  ] }));
  nodes.push(rect(912, 554, 396, 220, C.panel, { r: 8, stroke: C.border, children: [
    txt("Empty", 18, 18, 180, { size: 16, weight: "700" }),
    txt("当前集还没有 locked take", 18, 62, 300, { size: 15, weight: "700" }),
    txt("先回到 D 阶段审核并锁定至少一个 take。", 18, 94, 300, { size: 12, fill: C.secondary }),
    button("去 D 阶段", 18, 154, 94, "primary"),
  ] }));
  return nodes;
}

function deliveryOverview() {
  const nodes = [
    rect(0, 0, W, H, C.canvas),
    rect(40, 36, 1360, 108, C.inverse, { r: 8, children: [
      txt("Toonflow Web Complete Design Delivery", 28, 24, 720, { size: 28, weight: "700", fill: C.inverseText }),
      txt("Product-Spec v3.5 + Design-Brief 驱动。覆盖自动管线、路径 5、IP 时间线、质量协议与交付包边界。", 28, 64, 960, { size: 13, fill: C.muted }),
      pill("Spec aligned", 1120, 30, "success", 116),
      pill("Pencil MCP", 1248, 30, "info", 100),
    ] }),
  ];

  nodes.push(rect(40, 176, 312, 258, C.panel, { r: 8, stroke: C.border, children: [
    txt("Variables", 20, 18, 200, { size: 18, weight: "700" }),
    txt("颜色、字体、间距、圆角", 20, 48, 220, { size: 12, fill: C.secondary }),
    rect(20, 90, 56, 40, C.canvas, { r: 6, stroke: C.border }),
    rect(88, 90, 56, 40, C.panel, { r: 6, stroke: C.border }),
    rect(156, 90, 56, 40, C.inverse, { r: 6 }),
    rect(224, 90, 56, 40, C.blue, { r: 6 }),
    pill("success", 20, 158, "success", 86),
    pill("warning", 114, 158, "warning", 90),
    pill("danger", 214, 158, "danger", 82),
    txt("字体：Geist / Inter / IBM Plex Mono", 20, 212, 250, { size: 12, fill: C.secondary }),
  ] }));

  nodes.push(rect(380, 176, 312, 258, C.panel, { r: 8, stroke: C.border, children: [
    txt("Components", 20, 18, 220, { size: 18, weight: "700" }),
    txt("14 个符号组件，覆盖基础控件与业务对象。", 20, 48, 250, { size: 12, fill: C.secondary }),
    button("Primary", 20, 88, 94, "primary"),
    button("Secondary", 126, 88, 110, "secondary"),
    pill("stale", 20, 146, "warning", 82),
    pill("locked", 112, 146, "success", 82),
    rect(20, 194, 250, 42, C.raised, { r: 6, stroke: C.border, children: [
      txt("TrackRow / AgentMessage / MediaPanel", 12, 14, 220, { size: 12, fill: C.secondary }),
    ] }),
  ] }));

  nodes.push(rect(720, 176, 640, 258, C.panel, { r: 8, stroke: C.border, children: [
    txt("Pages", 20, 18, 220, { size: 18, weight: "700" }),
    txt("11 个主页面 + 关键流程/治理页面，覆盖 Spec v3.5 页面清单。", 20, 48, 480, { size: 12, fill: C.secondary }),
    tableRow(["页面", "覆盖重点", "状态"], 20, 88, [190, 290, 118], { header: true }),
    tableRow(["Auto Run", "5 模式、停顿点、事件流", "done"], 20, 126, [190, 290, 118]),
    tableRow(["Path 5", "D 提交确认、批量任务、成本", "done"], 20, 164, [190, 290, 118]),
    tableRow(["Delivery", "Episode 包 / Project 迁移包边界", "done"], 20, 202, [190, 290, 118]),
  ] }));

  nodes.push(rect(40, 468, 652, 350, C.panel, { r: 8, stroke: C.border, children: [
    txt("Page Area Overview", 20, 18, 260, { size: 18, weight: "700" }),
    txt("页面区导出目标：所有主页面均有独立 frame，可逐个导出。", 20, 48, 480, { size: 12, fill: C.secondary }),
    rect(20, 88, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("01 Project", 14, 28, 100, { size: 12, weight: "700" })] }),
    rect(166, 88, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("02 Source", 14, 28, 100, { size: 12, weight: "700" })] }),
    rect(312, 88, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("03 Agent", 14, 28, 100, { size: 12, weight: "700" })] }),
    rect(458, 88, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("04 Scripts", 14, 28, 100, { size: 12, weight: "700" })] }),
    rect(20, 184, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("05 Assets", 14, 28, 100, { size: 12, weight: "700" })] }),
    rect(166, 184, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("06 Auto Run", 14, 28, 100, { size: 12, weight: "700" })] }),
    rect(312, 184, 132, 78, C.inverse, { r: 6, children: [txt("07 Path 5", 14, 28, 100, { size: 12, weight: "700", fill: C.inverseText })] }),
    rect(458, 184, 132, 78, C.raised, { r: 6, stroke: C.border, children: [txt("08 IP Timeline", 14, 28, 100, { size: 12, weight: "700" })] }),
  ] }));

  nodes.push(rect(720, 468, 640, 350, C.panel, { r: 8, stroke: C.border, children: [
    txt("State Variants", 20, 18, 220, { size: 18, weight: "700" }),
    txt("状态区导出目标：覆盖默认、空、加载、错误、阻塞、豁免和对账。", 20, 48, 500, { size: 12, fill: C.secondary }),
    pill("draft", 20, 92, "neutral", 78),
    pill("running", 110, 92, "info", 86),
    pill("locked", 208, 92, "success", 82),
    pill("stale", 302, 92, "warning", 82),
    pill("failed", 396, 92, "danger", 82),
    pill("waived", 490, 92, "info", 82),
    pill("reconciling", 20, 142, "info", 110),
    pill("duplicate_blocked", 144, 142, "warning", 146),
    pill("compliance_failed", 304, 142, "danger", 150),
    rect(20, 210, 570, 78, C.warningSoft, { r: 8, stroke: C.warningSoft, children: [
      txt("新版 Skill 导出检查", 16, 14, 220, { size: 14, weight: "700", fill: C.warning }),
      txt("总设计容器、页面区、状态区和独立主页面均导出到 design_export/。", 16, 42, 500, { size: 12, fill: C.secondary }),
    ] }),
  ] }));

  return nodes;
}

function pageOverview() {
  const nodes = [
    rect(0, 0, W, H, C.canvas),
    txt("Toonflow Web Page Area Overview v3.5", 48, 42, 720, { size: 28, weight: "700" }),
    txt("页面区 PNG 导出目标：主页面、自动流程、质量治理和交付包边界均可独立对照开发。", 48, 82, 820, { size: 14, fill: C.secondary }),
  ];
  const pages = [
    ["01", "Project List", "项目创建、空状态、RuntimeCheck"],
    ["02", "Auto Run", "5 模式、停顿点、事件流"],
    ["03", "IP Timeline", "跨集 IP 资产连续性"],
    ["04", "Source Document", "导入、解析、编辑、下游影响"],
    ["05", "Script Agent", "消息流、AgentRun、文本门禁"],
    ["06", "Script Management", "版本对比、回滚、开始制作"],
    ["07", "Asset Workshop", "AssetVersion、canonical、授权"],
    ["08", "Production D", "TrackSegment、策略、依赖、成本"],
    ["09", "Path 5", "D 提交确认、批量任务、预算"],
    ["10", "Quality Protocol", "质量门禁、豁免、阻塞规则"],
    ["11", "Take + RoughCut", "深色审片、E 粗剪交付"],
    ["12", "Task Center", "恢复、对账、重复拦截"],
    ["13", "Settings", "模型、SecretRef、RuntimeCheck"],
    ["14", "Legacy Import", "只读扫描、映射、导入确认"],
    ["15", "Migration Package", "项目迁移包治理导出"],
    ["16", "State Variants", "状态视觉语法与异常态"],
  ];
  for (let i = 0; i < pages.length; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 48 + col * 330;
    const y = 142 + row * 148;
    const inverse = i === 8 || i === 10;
    nodes.push(rect(x, y, 286, 112, inverse ? C.inverse : C.panel, { r: 8, stroke: inverse ? C.inverse : C.border, children: [
      txt(pages[i][0], 18, 18, 44, { size: 22, weight: "700", font: "IBM Plex Mono", fill: inverse ? C.inverseText : C.blue }),
      txt(pages[i][1], 72, 20, 178, { size: 15, weight: "700", fill: inverse ? C.inverseText : C.text }),
      txt(pages[i][2], 72, 50, 178, { size: 12, fill: inverse ? C.muted : C.secondary }),
      pill("export target", 72, 86, inverse ? "inverse" : "neutral", 108),
    ] }));
  }
  return nodes;
}

if (screen === "delivery_overview") return deliveryOverview();
if (screen === "page_overview") return pageOverview();
if (screen === "design_system") return designSystem();
if (screen === "component_symbols") return componentSymbols();
if (screen === "project_list") return projectList(false);
if (screen === "project_empty") return projectList(true);
if (screen === "source") return sourceScreen();
if (screen === "script_agent") return scriptAgentScreen();
if (screen === "script_management") return scriptManagementScreen();
if (screen === "assets") return assetsScreen();
if (screen === "auto_run") return autoRunScreen();
if (screen === "production") return productionScreen();
if (screen === "path5") return path5Screen();
if (screen === "ip_timeline") return ipTimelineScreen();
if (screen === "roughcut") return roughCutScreen();
if (screen === "quality_protocol") return qualityProtocolScreen();
if (screen === "task_center") return taskCenterScreen();
if (screen === "settings") return settingsScreen();
if (screen === "legacy_import") return legacyImportScreen();
if (screen === "export") return exportScreen();
if (screen === "states") return stateBoard();

return designSystem();
