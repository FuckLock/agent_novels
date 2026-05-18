'use client';

import { useMemo, useState } from 'react';
import Modal from '@/app/components/Modal';
import Button from '@/app/components/Button';

interface ScriptVersionInput {
  id: string;
  versionNo: number;
  status?: string;
  qualityStatus?: string;
  updatedAt?: string;
  content: string;
}

interface ScriptDiffModalProps {
  isOpen: boolean;
  encodedName: string;
  episode: number;
  fromVersion: ScriptVersionInput;
  toVersion: ScriptVersionInput;
  onClose: () => void;
  onRolledBack?: () => void;
}

type DiffOp = 'unchanged' | 'added' | 'removed';

interface DiffLine {
  op: DiffOp;
  text: string;
  leftNo?: number;
  rightNo?: number;
}

/**
 * 行级 LCS diff —— unified 视图。
 * 用动态规划计算最长公共子序列，再回溯出 added / removed / unchanged 序列。
 */
function computeLineDiff(fromText: string, toText: string): DiffLine[] {
  const fromLines = fromText.split('\n');
  const toLines = toText.split('\n');
  const m = fromLines.length;
  const n = toLines.length;

  // dp[i][j] = LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (fromLines[i - 1] === toLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  let leftNo = m;
  let rightNo = n;
  while (i > 0 && j > 0) {
    if (fromLines[i - 1] === toLines[j - 1]) {
      result.unshift({ op: 'unchanged', text: fromLines[i - 1], leftNo, rightNo });
      i--; j--; leftNo--; rightNo--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      result.unshift({ op: 'removed', text: fromLines[i - 1], leftNo });
      i--; leftNo--;
    } else {
      result.unshift({ op: 'added', text: toLines[j - 1], rightNo });
      j--; rightNo--;
    }
  }
  while (i > 0) {
    result.unshift({ op: 'removed', text: fromLines[i - 1], leftNo });
    i--; leftNo--;
  }
  while (j > 0) {
    result.unshift({ op: 'added', text: toLines[j - 1], rightNo });
    j--; rightNo--;
  }
  return result;
}

export default function ScriptDiffModal({
  isOpen,
  encodedName,
  episode,
  fromVersion,
  toVersion,
  onClose,
  onRolledBack,
}: ScriptDiffModalProps) {
  // 二次确认状态分支：idle -> confirming -> rolling
  const [stage, setStage] = useState<'idle' | 'confirming' | 'rolling'>('idle');
  const [error, setError] = useState<string | null>(null);

  const diffLines = useMemo(
    () => computeLineDiff(fromVersion.content || '', toVersion.content || ''),
    [fromVersion.content, toVersion.content],
  );

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.op === 'added') added++;
      else if (line.op === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  const handleRollbackClick = () => {
    setError(null);
    setStage('confirming');
  };

  const handleCancelConfirm = () => {
    setStage('idle');
  };

  const handleConfirmRollback = async () => {
    setStage('rolling');
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodedName}/scripts/${episode}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rollback', versionId: fromVersion.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '回滚失败');
      }
      onRolledBack?.();
      setStage('idle');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '回滚失败');
      setStage('confirming');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={stage === 'rolling' ? () => undefined : onClose}
      title={`版本对比 · 第 ${episode} 集`}
    >
      <div className="space-y-4">
        {/* 版本元信息 */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div>
            <span className="font-semibold text-rose-600">基线 v{fromVersion.versionNo}</span>
            {fromVersion.updatedAt && (
              <span className="ml-2 text-gray-400">{new Date(fromVersion.updatedAt).toLocaleString()}</span>
            )}
          </div>
          <div className="text-gray-400">→</div>
          <div>
            <span className="font-semibold text-emerald-600">目标 v{toVersion.versionNo}</span>
            {toVersion.updatedAt && (
              <span className="ml-2 text-gray-400">{new Date(toVersion.updatedAt).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* diff 统计 */}
        <div className="flex gap-3 text-xs">
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">+{stats.added} 新增</span>
          <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">-{stats.removed} 删除</span>
        </div>

        {/* diff 行级视图（unified） */}
        <div className="max-h-[40vh] overflow-y-auto rounded border border-gray-200 font-mono text-xs">
          {diffLines.length === 0 ? (
            <div className="px-3 py-2 text-gray-400">两个版本内容完全相同</div>
          ) : (
            diffLines.map((line, idx) => {
              const rowClass =
                line.op === 'added'
                  ? 'bg-emerald-50 text-emerald-800'
                  : line.op === 'removed'
                  ? 'bg-rose-50 text-rose-800'
                  : 'text-gray-700';
              const marker = line.op === 'added' ? '+' : line.op === 'removed' ? '-' : ' ';
              return (
                <div key={idx} className={`flex gap-2 px-2 py-0.5 ${rowClass}`}>
                  <span className="w-6 shrink-0 select-none text-right text-gray-400">{line.leftNo ?? ''}</span>
                  <span className="w-6 shrink-0 select-none text-right text-gray-400">{line.rightNo ?? ''}</span>
                  <span className="w-3 shrink-0 select-none">{marker}</span>
                  <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
                </div>
              );
            })
          )}
        </div>

        {/* amber 二次确认影响提示 */}
        {stage === 'confirming' && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="mb-1 font-semibold">回滚到 v{fromVersion.versionNo} 将影响下游：</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>当前剧本内容会被覆盖（不可撤销）</li>
              <li>下游分镜 / 资产清单 / 镜头计划可能被标记为 stale / needs_regeneration</li>
              <li>正在进行中的审核任务会回到草稿状态</li>
            </ul>
            <p className="mt-2 text-amber-700">请确认是否继续？</p>
          </div>
        )}

        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        {/* 操作按钮组（状态分支） */}
        <div className="flex justify-end gap-2 pt-2">
          {stage === 'idle' && (
            <>
              <Button variant="secondary" onClick={onClose} aria-label="取消对比">
                取消
              </Button>
              <Button variant="danger" onClick={handleRollbackClick} aria-label="回滚到所选版本">
                回滚到 v{fromVersion.versionNo}
              </Button>
            </>
          )}
          {stage === 'confirming' && (
            <>
              <Button variant="secondary" onClick={handleCancelConfirm} aria-label="取消回滚">
                再想想
              </Button>
              <Button variant="danger" onClick={handleConfirmRollback} aria-label="确认回滚">
                确认回滚
              </Button>
            </>
          )}
          {stage === 'rolling' && (
            <Button variant="danger" loading disabled aria-label="回滚执行中">
              回滚中
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
