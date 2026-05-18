'use client';
import { useState } from 'react';
import { STAT_ICONS, EDIT_BTN, parseDescription, buildDescription, ProjectDetail } from '../types';

interface OverviewTabProps {
  project: ProjectDetail;
  encodedName: string;
  name: string;
  onReload: () => void;
}

export default function OverviewTab({ project, encodedName, name, onReload }: OverviewTabProps) {
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ projectType: '', novelType: '', style: '', ratio: '' });

  const desc = parseDescription(project.description || '');
  const summary = desc['小说简介'] || '';
  const assets = project.assets || [];
  const scripts = project.scripts || [];

  const stats = [
    { label: '角色数量', value: assets.filter(a => a.type === 'roles' || a.type === 'characters').length },
    { label: '剧本集数', value: scripts.length },
    { label: '分镜数量', value: 0 },
    { label: '视频数量', value: 0 },
  ];

  // ========== 概览：保存简介 ==========
  const saveSummary = async () => {
    const newDesc = buildDescription(name, {
      projectType: desc['项目类型'] || '',
      novelType: desc['小说类型'] || '',
      style: desc['影片画风'] || '',
      ratio: desc['影片比例'] || '',
      summary: summaryDraft,
    });
    await fetch(`/api/projects/${encodedName}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDesc }),
    });
    setEditingSummary(false);
    onReload();
  };

  // ========== 概览：保存设置 ==========
  const saveSettings = async () => {
    const newDesc = buildDescription(name, {
      projectType: settingsDraft.projectType,
      novelType: settingsDraft.novelType,
      style: settingsDraft.style,
      ratio: settingsDraft.ratio,
      summary: desc['小说简介'] || '',
    });
    await fetch(`/api/projects/${encodedName}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDesc }),
    });
    setEditingSettings(false);
    onReload();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">项目概述</h2>
        <p className="text-sm text-gray-500">查看项目整体进度和统计信息</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat, i) => (
          <div key={stat.label} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <svg className={`w-5 h-5 ${STAT_ICONS[i].color.replace('bg-', 'text-').replace('-50', '-500')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={STAT_ICONS[i].icon} />
              </svg>
              <span className="text-3xl font-bold text-gray-800">{stat.value}</span>
            </div>
            <div className="text-sm text-gray-500 mt-2">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 小说简介 */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-800">小说简介</h3>
          {!editingSummary && (
            <button
              onClick={() => { setSummaryDraft(summary); setEditingSummary(true); }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600"
            >
              {EDIT_BTN}编辑
            </button>
          )}
        </div>
        {editingSummary ? (
          <>
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setEditingSummary(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={saveSummary} className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">保存</button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600">{summary || '暂无简介'}</p>
        )}
      </div>

      {/* 全局设置 - 修复：项目类型和小说类型分离 */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-800">全局设置</h3>
          {!editingSettings && (
            <button
              onClick={() => {
                setSettingsDraft({
                  projectType: desc['项目类型'] || '',
                  novelType: desc['小说类型'] || '',
                  style: desc['影片画风'] || '',
                  ratio: desc['影片比例'] || '',
                });
                setEditingSettings(true);
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600"
            >
              {EDIT_BTN}编辑
            </button>
          )}
        </div>
        {editingSettings ? (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">项目类型</label>
                <select
                  value={settingsDraft.projectType}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, projectType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                >
                  <option value="">选择项目类型</option>
                  <option value="基于小说原文">基于小说原文</option>
                  <option value="基于剧本">基于剧本</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">影片比例</label>
                <select
                  value={settingsDraft.ratio}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, ratio: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                >
                  <option value="">选择比例</option>
                  {['16:9', '9:16', '1:1'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">影片画风</label>
                <select
                  value={settingsDraft.style}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, style: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                >
                  <option value="">选择画风</option>
                  {['3D国漫', '2D国漫', '2.5D国漫', '真人'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">小说类型</label>
                <input
                  type="text"
                  value={settingsDraft.novelType}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, novelType: e.target.value })}
                  placeholder="例如：玄幻、都市、言情"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingSettings(false)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={saveSettings} className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">保存</button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">项目类型</div>
              <div className="text-sm text-gray-700">{desc['项目类型'] || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">影片比例</div>
              <div className="text-sm text-gray-700">{desc['影片比例'] || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">影片画风</div>
              <div className="text-sm text-gray-700">{desc['影片画风'] || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">小说类型</div>
              <div className="text-sm text-gray-700">{desc['小说类型'] || '-'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
