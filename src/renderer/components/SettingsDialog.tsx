import React, { useState, useCallback } from 'react';
import {
  X, Sun, Moon, Download, Trash2, Info, FileJson, FileText,
  AlertTriangle, CheckCircle2, Copy, ExternalLink, ChevronRight
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { PROVIDER_CATALOG } from '../../shared/providers';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

type ExportFormat = 'markdown' | 'json';

export default function SettingsDialog() {
  const showSettings = useAppStore((s) => s.showSettingsDialog);
  const setShowSettings = useAppStore((s) => s.setShowSettingsDialog);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const syncMessages = useAppStore((s) => s.syncMessages);
  const groups = useAppStore((s) => s.groups);
  const responses = useAppStore((s) => s.responses);
  const clearSyncMessages = useAppStore((s) => s.clearSyncMessages);

  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmClearData, setConfirmClearData] = useState(false);

  // --- Theme Toggle ---
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // --- Export Logic ---
  const generateMarkdown = useCallback(() => {
    let md = `# MultiChat 聊天记录导出\n\n`;
    md += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n`;

    // Sync mode messages
    if (syncMessages.length > 0) {
      md += `## ⚡ 同步模式消息\n\n`;
      for (const msg of syncMessages) {
        const time = new Date(msg.timestamp).toLocaleString('zh-CN');
        if (msg.role === 'user') {
          md += `### 👤 我 (${time})\n\n${msg.content}\n\n`;
        } else {
          md += `### 🤖 ${msg.senderName || msg.sender} (${time})\n\n${msg.content}\n\n`;
        }
      }
      md += `\n---\n\n`;
    }

    // Group chat messages
    if (groups.length > 0) {
      for (const group of groups) {
        md += `## 💬 群聊: ${group.name}\n`;
        if (group.description) md += `*${group.description}*\n`;
        md += `> 成员: ${group.members.map(m => m.nickname).join(', ')}\n\n`;

        for (const msg of group.messages) {
          const time = new Date(msg.timestamp).toLocaleString('zh-CN');
          if (msg.role === 'user') {
            md += `**👤 我** *(${time})*\n\n${msg.content}\n\n`;
          } else if (msg.role === 'ai') {
            md += `**${msg.senderName || msg.sender}** *(${time})*\n\n${msg.content}\n\n`;
          }
        }
        md += `---\n\n`;
      }
    }

    // AI Responses summary (from sync mode)
    if (Object.keys(responses).length > 0) {
      md += `## 📋 各平台回复摘要\n\n| 平台 | 回复 |\n|------|------|\n`;
      for (const [providerId, content] of Object.entries(responses)) {
        const provider = PROVIDER_CATALOG.find(p => p.id === providerId);
        const name = provider?.name || providerId;
        const shortContent = content.length > 100 ? content.slice(0, 100) + '...' : content;
        md += `| ${name} ${provider?.icon || ''} | ${shortContent.replace(/\n/g, ' ')} |\n`;
      }
    }

    return md;
  }, [syncMessages, groups, responses]);

  const generateJSON = useCallback(() => {
    return JSON.stringify({
      exportTime: new Date().toISOString(),
      version: '1.0',
      app: 'MultiChat',
      syncMessages,
      groups: groups.map(g => ({
        ...g,
        // Don't include excessively long message content in JSON export
        messages: g.messages.map(m => ({
          ...m,
          content: m.content
        }))
      })),
      responses
    }, null, 2);
  }, [syncMessages, groups, responses]);

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);

    try {
      // Try to open a save dialog
      const ext = exportFormat === 'markdown' ? 'md' : 'json';
      const defaultName = `multichat-export-${new Date().toISOString().slice(0, 10)}.${ext}`;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [
          {
            name: exportFormat === 'markdown' ? 'Markdown' : 'JSON',
            extensions: [ext]
          }
        ]
      });

      if (!filePath) {
        setExportResult({ ok: false, msg: '已取消导出' });
        setExporting(false);
        return;
      }

      const content = exportFormat === 'markdown' ? generateMarkdown() : generateJSON();
      await writeTextFile(filePath, content);

      setExportResult({ ok: true, msg: `已导出到: ${filePath.split(/[\\/]/).pop()}` });
    } catch (err) {
      console.error('Export failed:', err);
      setExportResult({ ok: false, msg: `导出失败: ${String(err)}` });
    } finally {
      setExporting(false);
    }
  };

  // --- Clear Data ---
  const handleClearAllData = () => {
    try {
      clearSyncMessages();
      localStorage.removeItem('multichat-storage');
      window.location.reload(); // Full reload to reset all state
    } catch (err) {
      console.error('Clear data failed:', err);
    }
  };

  // --- Stats ---
  const totalMessages = syncMessages.length + groups.reduce((acc, g) => acc + g.messages.length, 0);
  const totalGroups = groups.length;

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setShowSettings(false)}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            ⚙️ 设置
          </h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* === Theme Section === */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-tertiary)' }}>
              外观
            </h3>
            <div
              className="flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all duration-200"
              style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-default)'
              }}
              onClick={toggleTheme}
            >
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon size={18} style={{ color: '#FBBF24' }} />
                ) : (
                  <Sun size={18} style={{ color: '#F59E0B' }} />
                )}
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    主题模式
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    当前: {theme === 'dark' ? '🌙 深色模式' : '☀️ 浅色模式'}
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <div
                className="w-11 h-6 rounded-full p-0.5 transition-colors duration-300 flex items-center"
                style={{
                  background: theme === 'dark' ? '#374151' : '#6366F1'
                }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center text-[10px]"
                  style={{
                    transform: theme === 'light' ? 'translateX(20px)' : 'translateX(0)'
                  }}
                >
                  {theme === 'dark' ? '🌙' : '☀️'}
                </div>
              </div>
            </div>
          </section>

          {/* === Export Section === */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-tertiary)' }}>
              数据管理
            </h3>

            {/* Format selector */}
            <div
              className="flex gap-2 mb-3 p-1 rounded-lg"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <button
                onClick={() => setExportFormat('markdown')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all duration-200 ${
                  exportFormat === 'markdown' ? 'bg-[#6366F1] text-white shadow-md' : ''
                }`}
                style={exportFormat === 'markdown' ? {} : { color: 'var(--text-secondary)' }}
              >
                <FileText size={13} />
                Markdown
              </button>
              <button
                onClick={() => setExportFormat('json')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all duration-200 ${
                  exportFormat === 'json' ? 'bg-[#6366F1] text-white shadow-md' : ''
                }`}
                style={exportFormat === 'json' ? {} : { color: 'var(--text-secondary)' }}
              >
                <FileJson size={13} />
                JSON
              </button>
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={exporting || totalMessages === 0}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                exporting
                  ? 'opacity-60 cursor-wait'
                  : 'hover:bg-white/10 active:scale-[0.98]'
              }`}
              style={{
                background: exporting
                  ? 'rgba(99,102,241,0.15)'
                  : 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                color: '#818CF8',
                ...(totalMessages === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {})
              }}
            >
              {exporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download size={15} />
                  导出聊天记录 ({totalMessages} 条消息{totalGroups > 0 ? `, ${totalGroups} 个群聊` : ''})
                </>
              )}
            </button>

            {/* Export result */}
            {exportResult && (
              <div
                className={`mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs ${
                  exportResult.ok ? '' : ''
                }`}
                style={{
                  background: exportResult.ok ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                  color: exportResult.ok ? '#34D399' : '#F87171'
                }}
              >
                {exportResult.ok ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <AlertTriangle size={12} />
                )}
                {exportResult.msg}
              </div>
            )}

            {/* Data stats */}
            <div
              className="mt-3 grid grid-cols-3 gap-2"
            >
              {[
                { label: '同步消息', value: syncMessages.length },
                { label: '群聊', value: totalGroups },
                { label: 'AI回复', value: Object.keys(responses).length }
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="text-center p-2 rounded-lg"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}
                >
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* === Danger Zone: Clear Data === */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-tertiary)' }}>
              危险区域
            </h3>
            {!confirmClearData ? (
              <button
                onClick={() => setConfirmClearData(true)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-red-500/10 group"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid rgba(239,68,68,0.15)'
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 size={15} className="text-red-400/70 group-hover:text-red-400" />
                  <span className="text-sm text-red-400/80 group-hover:text-red-400">清除所有数据</span>
                </div>
                <ChevronRight size={14} className="text-red-400/30 group-hover:text-red-400/60" />
              </button>
            ) : (
              <div
                className="p-4 rounded-xl space-y-3"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.25)'
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">确认清除所有数据？</p>
                    <p className="text-xs mt-1 text-red-400/60">
                      此操作将删除所有聊天记录、群聊和设置，且不可恢复！
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setConfirmClearData(false)}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-default)'
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleClearAllData}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-red-500/90 text-white hover:bg-red-500 active:scale-[0.97] transition-all"
                  >
                    确认清除
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* === About Section === */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-tertiary)' }}>
              关于
            </h3>
            <div
              className="p-4 rounded-xl space-y-2.5"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center shadow-lg shadow-[#6366F1]/20">
                  <span className="text-white text-sm">⚡</span>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    MultiChat
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    多 AI 聚合聊天客户端 v1.0
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                {[
                  { icon: '🧠', label: 'AI 平台', value: `${PROVIDER_CATALOG.length} 个` },
                  { icon: '💬', label: '模式', value: '同步 / 群聊' },
                  { icon: '🛠', label: '技术栈', value: 'Tauri v2 + React + Rust' },
                  { icon: '📦', label: '存储', value: 'localStorage (持久化)' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {item.icon} {item.label}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center justify-between text-[10px]"
          style={{
            borderTop: '1px solid var(--border-default)',
            color: 'var(--text-muted)'
          }}
        >
          <span>Made with ❤️ for AI enthusiasts</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}
