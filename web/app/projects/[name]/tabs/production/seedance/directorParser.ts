export interface CharacterInfo {
  name: string;
  role: string;
  age: string;
  appearance: string;
  costume: string;
  emotion: string;
  fullTable: Record<string, string>;
}

export interface SceneInfo {
  id: string;
  name: string;
  time: string;
  atmosphere: string;
  lighting: string;
  fullTable: Record<string, string>;
}

export interface DirectorData {
  emotionalArc: string;
  emotionalKeywords: string;
  summary: string;
  characters: CharacterInfo[];
  scenes: SceneInfo[];
  rawContent: string;
}

/** 解析 Markdown 表格（| 字段 | 描述 | 格式）为 key-value 映射 */
function parseTable(tableText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = tableText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // 忽略分隔行 |---|---|
    if (!trimmed.startsWith('|') || /^\|[-\s|]+\|$/.test(trimmed)) continue;
    const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
    if (cells.length >= 2) {
      result[cells[0]] = cells.slice(1).join(' | ');
    }
  }
  return result;
}

/** 提取两个标题之间的内容块 */
function extractSection(content: string, headingPattern: RegExp): string {
  const match = content.match(headingPattern);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  // 找下一个同级标题（## 或更高）
  const nextHeading = content.slice(start).search(/\n##\s/);
  const end = nextHeading >= 0 ? start + nextHeading : content.length;
  return content.slice(start, end).trim();
}

/** 从情绪弧线区块提取弧线文字（代码块或普通文本） */
function extractEmotionalArc(sectionText: string): string {
  // 优先提取代码块内容
  const codeMatch = sectionText.match(/```[\s\S]*?\n([\s\S]+?)\n```/);
  if (codeMatch) return codeMatch[1].trim();
  // 否则取第一个非空行
  for (const line of sectionText.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && !t.startsWith('**')) return t;
  }
  return '';
}

/** 从情绪弧线区块提取关键词（**核心情绪关键词**：... 格式） */
function extractEmotionalKeywords(sectionText: string): string {
  const match = sectionText.match(/\*{1,2}核心情绪关键词\*{1,2}\s*[：:]\s*(.+)/);
  if (match) return match[1].trim();
  return '';
}

/** 从情绪弧线区块提取概述段落（去除弧线和关键词行后的正文） */
function extractSummary(sectionText: string): string {
  const lines = sectionText.split('\n');
  const paragraphLines: string[] = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    if (/\*{1,2}核心情绪关键词\*{1,2}/.test(t)) continue;
    paragraphLines.push(t);
  }
  return paragraphLines.join('\n').trim();
}

/** 解析人物清单区块，返回 CharacterInfo 列表 */
function parseCharacters(sectionText: string): CharacterInfo[] {
  const characters: CharacterInfo[] = [];
  // 补前导换行，确保 sectionText 以 "### " 开头时也能被正确 split
  const charBlocks = ('\n' + sectionText).split(/\n###\s+/).filter(b => b.trim());
  for (const block of charBlocks) {
    const lines = block.split('\n');
    const header = lines[0].trim();
    if (!header) continue;

    // 从标题推断姓名和角色
    // 格式常见：叶真（主角）/ 米江雪（母亲）
    const nameMatch = header.match(/^([^\s（(]+)/);
    const roleMatch = header.match(/[（(](.+?)[）)]/);
    const name = nameMatch ? nameMatch[1] : header;
    const role = roleMatch ? roleMatch[1] : '';

    const tableText = lines.slice(1).join('\n');
    const fullTable = parseTable(tableText);

    characters.push({
      name,
      role,
      age: fullTable['年龄'] || '',
      appearance: fullTable['外形'] || '',
      costume: fullTable['服装'] || '',
      emotion: fullTable['本集情绪状态'] || '',
      fullTable,
    });
  }
  return characters;
}

/** 解析场景清单区块，返回 SceneInfo 列表 */
function parseScenes(sectionText: string): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  // 补前导换行，确保 sectionText 以 "### " 开头时也能被正确 split
  const sceneBlocks = ('\n' + sectionText).split(/\n###\s+/).filter(b => b.trim());

  // 先收集所有从标题手动提取的 id，避免自动分配时重复
  const usedIds = new Set<string>();
  for (const block of sceneBlocks) {
    const header = block.split('\n')[0].trim();
    const idFromTitle = header.match(/场景\s*([A-Z])/i);
    if (idFromTitle) usedIds.add(idFromTitle[1].toUpperCase());
  }

  // 自动分配从 'A' 开始，跳过已被手动使用的字母
  let idCharCode = 65; // 'A'
  const nextAutoId = (): string => {
    while (usedIds.has(String.fromCharCode(idCharCode))) {
      idCharCode++;
    }
    const id = String.fromCharCode(idCharCode);
    usedIds.add(id);
    idCharCode++;
    return id;
  };

  for (const block of sceneBlocks) {
    const lines = block.split('\n');
    const header = lines[0].trim();
    if (!header) continue;

    // 尝试从标题提取场景字母编号，如 "场景 A：齐云宗山门广场"
    const idFromTitle = header.match(/场景\s*([A-Z])/i);
    const id = idFromTitle ? idFromTitle[1].toUpperCase() : nextAutoId();

    // 场景名：去除 "场景 X：" 前缀
    const name = header.replace(/^场景\s*[A-Z]\s*[：:]\s*/i, '').trim() || header;

    const tableText = lines.slice(1).join('\n');
    const fullTable = parseTable(tableText);

    scenes.push({
      id,
      name,
      time: fullTable['时间'] || '',
      atmosphere: fullTable['氛围'] || '',
      lighting: fullTable['光线'] || '',
      fullTable,
    });
  }
  return scenes;
}

/**
 * 解析 01-director.md 内容为 DirectorData
 */
export function parseDirectorNotes(content: string): DirectorData {
  if (!content) {
    return {
      emotionalArc: '',
      emotionalKeywords: '',
      summary: '',
      characters: [],
      scenes: [],
      rawContent: content,
    };
  }

  // 一、本集情绪弧线
  const arcSection = extractSection(content, /##\s*一[、.．]\s*本集情绪弧线/);
  const emotionalArc = extractEmotionalArc(arcSection);
  const emotionalKeywords = extractEmotionalKeywords(arcSection);
  const summary = extractSummary(arcSection);

  // 二、人物清单
  const charSection = extractSection(content, /##\s*二[、.．]\s*人物清单/);
  const characters = parseCharacters(charSection);

  // 三、场景清单
  const sceneSection = extractSection(content, /##\s*三[、.．]\s*场景清单/);
  const scenes = parseScenes(sceneSection);

  return {
    emotionalArc,
    emotionalKeywords,
    summary,
    characters,
    scenes,
    rawContent: content,
  };
}
