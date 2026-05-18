import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const designPath = path.join(root, "designs", "toonflow-web-design.pen");
const scriptPath = path.join(root, "designs", "pencil-scripts", "toonflow-screen.js");

const existingDesign = JSON.parse(fs.readFileSync(designPath, "utf8"));
const source = fs.readFileSync(scriptPath, "utf8");
const render = new Function("pencil", source);

const targets = [
  ["g11oJ", "00 Complete Delivery Overview", "delivery_overview", 0, 0],
  ["00jA3", "01 Page Area Overview", "page_overview", 1520, 0],
  ["XomxJ", "02 Design System", "design_system", 3040, 0],
  ["rfq8K", "03 Reusable Component Symbols", "component_symbols", 4560, 0],
  ["t3YZ4", "04 Project List", "project_list", 0, 1040],
  ["qkvbM", "04B Project Empty + New Project", "project_empty", 1520, 1040],
  ["gELCJ", "05 Auto Run Pipeline", "auto_run", 3040, 1040],
  ["0sFDp", "06 IP Asset Timeline", "ip_timeline", 4560, 1040],
  ["aZsBU", "07 Source Document", "source", 0, 2080],
  ["wabbS", "08 Script Agent", "script_agent", 1520, 2080],
  ["W8TSr", "09 Script Management", "script_management", 3040, 2080],
  ["BJUUw", "10 Asset Workshop", "assets", 4560, 2080],
  ["tnCIh", "11 Production Pipeline D", "production", 0, 3120],
  ["S7hxr", "12 Path 5 D Submit Confirmation", "path5", 1520, 3120],
  ["jRBEl", "13 Quality Protocol", "quality_protocol", 3040, 3120],
  ["D8fY7", "14 Take Review + E RoughCut", "roughcut", 4560, 3120],
  ["ojOq5", "15 Task Center", "task_center", 0, 4160],
  ["0uzii", "16 Settings + Security", "settings", 1520, 4160],
  ["IXUQX", "17 Legacy Import Wizard", "legacy_import", 3040, 4160],
  ["JOLO6", "18 ProjectMigrationPackage Check", "export", 4560, 4160],
  ["5G1Ly", "19 State Variants", "states", 0, 5200],
];

const variables = {
  "accent.primary": { type: "color", value: "#2563EB" },
  "accent.primarySoft": { type: "color", value: "#EAF1FF" },
  "border.strong": { type: "color", value: "#C7D0DD" },
  "border.subtle": { type: "color", value: "#E1E6EF" },
  "font.body": { type: "string", value: "Geist" },
  "font.caption": { type: "string", value: "Inter" },
  "font.data": { type: "string", value: "IBM Plex Mono" },
  "font.heading": { type: "string", value: "Geist" },
  "radius.1": { type: "number", value: 4 },
  "radius.2": { type: "number", value: 6 },
  "radius.3": { type: "number", value: 8 },
  "semantic.danger": { type: "color", value: "#C33A3A" },
  "semantic.dangerSoft": { type: "color", value: "#FDECEC" },
  "semantic.info": { type: "color", value: "#0E7490" },
  "semantic.infoSoft": { type: "color", value: "#E6F7FB" },
  "semantic.success": { type: "color", value: "#17803D" },
  "semantic.successSoft": { type: "color", value: "#E8F6EE" },
  "semantic.warning": { type: "color", value: "#B66A00" },
  "semantic.warningSoft": { type: "color", value: "#FFF4DF" },
  "space.1": { type: "number", value: 4 },
  "space.2": { type: "number", value: 8 },
  "space.3": { type: "number", value: 12 },
  "space.4": { type: "number", value: 16 },
  "space.5": { type: "number", value: 20 },
  "space.6": { type: "number", value: 24 },
  "space.8": { type: "number", value: 32 },
  "surface.canvas": { type: "color", value: "#F6F7F9" },
  "surface.inverse": { type: "color", value: "#14181F" },
  "surface.inverseRaised": { type: "color", value: "#1C2230" },
  "surface.panel": { type: "color", value: "#FFFFFF" },
  "surface.raised": { type: "color", value: "#FBFCFE" },
  "text.inverse": { type: "color", value: "#F8FAFC" },
  "text.muted": { type: "color", value: "#8B94A1" },
  "text.primary": { type: "color", value: "#18202A" },
  "text.secondary": { type: "color", value: "#5D6673" },
};

const variableValues = Object.fromEntries(
  Object.entries(variables).map(([name, def]) => [`$${name}`, def.value]),
);

const design = {
  version: existingDesign.version || "2.11",
  variables,
  children: Array.isArray(existingDesign.children) ? existingDesign.children : [],
};

const usedIds = new Set();

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visitor);
  }
}

for (const child of design.children || []) {
  walk(child, (node) => {
    if (node.id) usedIds.add(node.id);
  });
}

let idCounter = 0;

function nextId() {
  while (true) {
    idCounter += 1;
    const id = `tf${idCounter.toString(36).padStart(4, "0")}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
}

function resolveVariables(value) {
  if (typeof value === "string") return variableValues[value] ?? value;
  if (Array.isArray(value)) return value.map(resolveVariables);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveVariables(child)]));
  }
  return value;
}

function cloneWithIds(node) {
  if (!node || typeof node !== "object") return node;
  const cloned = { ...resolveVariables(node), id: nextId() };
  if (Array.isArray(node.children)) {
    cloned.children = node.children.map(cloneWithIds);
  }
  return cloned;
}

function findNodeById(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    const found = Array.isArray(node.children) ? findNodeById(node.children, id) : null;
    if (found) return found;
  }
  return null;
}

const targetIds = new Set(targets.map(([frameId]) => frameId));
design.children = design.children.filter((node) => !targetIds.has(node.id));

for (const [frameId, frameName, screen, x, y] of targets) {
  const frame = {
    id: frameId,
    type: "frame",
    name: frameName,
    layout: "none",
    x,
    y,
    width: 1440,
    height: 960,
    fill: variables["surface.canvas"].value,
    children: [],
  };
  const nodes = render({ width: 1440, height: 960, input: { screen } });
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error(`Screen returned no nodes: ${screen}`);
  }
  frame.children = nodes.map(cloneWithIds);
  design.children.push(frame);
}

fs.writeFileSync(designPath, `${JSON.stringify(design, null, 2)}\n`);
console.log(`Materialized ${targets.length} Toonflow screens into ${designPath}`);
