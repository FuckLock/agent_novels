export type AgentIntent =
  | 'chat'
  | 'generate_skeleton'
  | 'generate_adaptation'
  | 'generate_script'
  | 'fix_skeleton'
  | 'fix_adaptation'
  | 'fix_script'
  | 'check_progress';

export type ExecuteAction =
  | 'generate_skeleton'
  | 'generate_adaptation'
  | 'generate_script'
  | 'fix_skeleton'
  | 'fix_adaptation'
  | 'fix_script';

export interface SSEEvent {
  type: 'text' | 'status' | 'content_saved' | 'error' | 'done';
  data: string;
  agentLabel?: string;
}

export interface ProjectConfig {
  totalEpisodes: number;
  episodeDuration: number;
  wordsPerEpisode: number;
  chapterRange: [number, number];
  platform: string;
  style: string;
  paywall: string;
}

export interface EpisodeStatus {
  episode: number;
  hasSkeleton: boolean;
  hasAdaptation: boolean;
  hasScript: boolean;
}

export interface ProjectContext {
  name: string;
  description: string;
  chapterCount: number;
  hasSkeleton: boolean;
  hasAdaptation: boolean;
  scriptCount: number;
  totalEpisodes: number;
  hasConfig: boolean;
  config: ProjectConfig | null;
  /** 每集的阶段完成状态（用于多集场景下的精确推进） */
  episodeStatuses: EpisodeStatus[];
}

export interface IntentResult {
  intent: AgentIntent;
  params: Record<string, unknown>;
}
