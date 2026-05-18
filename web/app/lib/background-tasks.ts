/**
 * 全局后台任务追踪器
 * 保持对运行中 Promise 的引用，防止被 GC 回收或 Next.js worker 终止
 */

const runningTasks = new Map<string, { promise: Promise<void>; startedAt: number }>();

/** 注册一个后台任务，返回 taskKey */
export function registerBackgroundTask(key: string, task: Promise<void>): void {
  runningTasks.set(key, { promise: task, startedAt: Date.now() });
  task.finally(() => {
    runningTasks.delete(key);
  });
}

/** 检查某个 key 的任务是否在运行 */
export function isTaskRunning(key: string): boolean {
  return runningTasks.has(key);
}

/** 查询指定项目中所有正在运行任务的集号列表（升序） */
export function getRunningEpisodes(projectName: string): number[] {
  const episodes = new Set<number>();
  for (const key of runningTasks.keys()) {
    if (key.includes(`-${projectName}-`)) {
      const match = key.match(/-(\d+)$/);
      if (match) episodes.add(parseInt(match[1], 10));
    }
  }
  return Array.from(episodes).sort((a, b) => a - b);
}
