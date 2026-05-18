export interface TimeSegment {
  time: string;
  content: string;
}

export interface PromptCard {
  id: string;
  title: string;
  shotType: string;
  duration: string;
  imageRefs: string[];
  timeSegments: TimeSegment[];
  audio: string;
  rawContent: string;
}

/** 从标题推断景别 */
function inferShotType(title: string): string {
  if (title.includes('大远景')) return '大远景';
  if (title.includes('远景')) return '远景';
  if (title.includes('全景')) return '全景';
  if (title.includes('中近景')) return '中近景';
  if (title.includes('近景')) return '近景';
  if (title.includes('中景')) return '中景';
  if (title.includes('特写')) return '特写';
  if (title.includes('俯拍')) return '俯拍';
  if (title.includes('航拍')) return '航拍';
  return '';
}

/** 从最后一个时间段标注推断时长，例如 "5-8秒" → "8秒" */
function inferDuration(timeSegments: TimeSegment[]): string {
  if (timeSegments.length === 0) return '';
  const lastTime = timeSegments[timeSegments.length - 1].time;
  // 匹配 "X-Y秒" 或 "X秒" 形式
  const rangeMatch = lastTime.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*秒/);
  if (rangeMatch) return `${rangeMatch[2]}秒`;
  const singleMatch = lastTime.match(/(\d+(?:\.\d+)?)\s*秒/);
  if (singleMatch) return `${singleMatch[1]}秒`;
  return '';
}

/** 解析单个 Pxx 块内容为时间段列表 */
function parseTimeSegments(content: string): TimeSegment[] {
  const segments: TimeSegment[] = [];
  // 按行扫描，识别 "0-1秒：" "1-5秒：" "0.5-4秒：" 等格式开头的行
  const lines = content.split('\n');
  let currentTime = '';
  let currentLines: string[] = [];

  const timePattern = /^(\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*秒|\d+(?:\.\d+)?\s*秒)\s*[：:]/;

  for (const line of lines) {
    const match = line.match(timePattern);
    if (match) {
      // 保存上一个时间段
      if (currentTime) {
        segments.push({ time: currentTime, content: currentLines.join('\n').trim() });
      }
      currentTime = match[1].trim();
      // 去掉时间标注本身，保留后面的描述
      const rest = line.slice(match[0].length).trim();
      currentLines = rest ? [rest] : [];
    } else if (currentTime) {
      // 判断是否是音效行或空行，音效行单独处理，这里忽略
      const isAudioLine = /^(背景音效|音效)\s*[：:]/.test(line.trim());
      if (!isAudioLine) {
        currentLines.push(line);
      }
    }
  }

  // 保存最后一个时间段
  if (currentTime) {
    segments.push({ time: currentTime, content: currentLines.join('\n').trim() });
  }

  return segments;
}

/** 提取音效行 */
function extractAudio(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (/^(背景音效|音效)\s*[：:]/.test(trimmed)) {
      return trimmed;
    }
  }
  return '';
}

/** 提取 @图N / @图片N 引用（去重，保持顺序）
 *  排除 "素材表@图N" 中的内嵌引用，只匹配行首独立引用 */
function extractImageRefs(content: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  // 负向后行断言排除 "素材表@图N"，同时兼容旧格式 @图片N
  const pattern = /(?<!素材表)@图片?\d+/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      refs.push(match[0]);
    }
  }
  return refs;
}

/** 资产引用解析结果 */
export interface AssetRef {
  localRef: string;    // "@图1"
  globalIndex: number; // 素材表中的全局编号（1-based）
  name: string;        // "齐云宗山门广场"
}

/** 解析 @图N（素材表@图M-名称）格式的资产引用 */
export function parseAssetRefs(content: string): AssetRef[] {
  const refs: AssetRef[] = [];
  const seen = new Set<string>();
  // 支持中文括号（）和英文括号 ()，中文短横线-和英文短横线-
  const pattern = /@图(\d+)\s*[（(]素材表@图(\d+)\s*[-\-]\s*([^）)]+)[）)]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const localRef = `@图${match[1]}`;
    if (!seen.has(localRef)) {
      seen.add(localRef);
      refs.push({
        localRef,
        globalIndex: parseInt(match[2], 10),
        name: match[3].trim(),
      });
    }
  }
  return refs;
}

/** 提取标题文字（去除 Markdown 标题符号和 PXX/TXX 编号前缀） */
function extractTitle(firstLine: string): string {
  // 去除 ## P01 或 ## T01 前缀，保留后面的描述部分
  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^[PT]\d{1,2}\s+/, '').trim();
  return cleaned;
}

/**
 * 解析 02-prompts.md 内容为 PromptCard 列表
 */
export function parsePrompts(content: string): PromptCard[] {
  if (!content) return [];

  const cards: PromptCard[] = [];

  // 在首行前加换行，确保第一个 P 块也能被正向先行断言匹配到
  content = '\n' + content.trim();

  // 按 ## P01 / ## T01 ... 分割（兼容 P/T 格式）
  // 用正向先行断言保留分隔符所在行
  const blockRegex = /(?=(?:^|\n)#{1,3}\s*[PT]\d{1,2}\b)/g;
  // 二次过滤：要求块的第一行必须以标题格式 "#{1,3} Pxx" 或 "#{1,3} Txx" 开头
  const rawParts = content.split(blockRegex).filter(part => {
    const firstLine = part.trimStart().split('\n')[0];
    return /^\s*#{1,3}\s*[PT]\d{1,2}/.test(firstLine);
  });

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // 提取 id（匹配 P01/T01 格式）
    const idMatch = trimmed.match(/([PT])(\d{1,2})/);
    if (!idMatch) continue;
    const id = `${idMatch[1]}${idMatch[2].padStart(2, '0')}`;

    // 提取标题（第一行）
    const firstLine = trimmed.split('\n')[0];
    const title = extractTitle(firstLine);

    const shotType = inferShotType(title);
    const imageRefs = extractImageRefs(trimmed);
    const timeSegments = parseTimeSegments(trimmed);
    const duration = inferDuration(timeSegments);
    const audio = extractAudio(trimmed);

    cards.push({
      id,
      title,
      shotType,
      duration,
      imageRefs,
      timeSegments,
      audio,
      rawContent: trimmed,
    });
  }

  return cards;
}
