import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Maximize2, Zap, ArrowLeft, Settings } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { cn } from '../lib/utils';

export default function TitleBar() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const maximized = useAppStore((s) => s.maximized);
  const previewProvider = useAppStore((s) => s.previewProvider);
  const setPreviewProvider = useAppStore((s) => s.setPreviewProvider);
  const setShowSettings = useAppStore((s) => s.setShowSettingsDialog);

  const handleMinimize = async () => {
    try { await getCurrentWindow().minimize(); } catch {}
  };

  const handleMaximize = async () => {
    try { await getCurrentWindow().toggleMaximize(); } catch {}
  };

  const handleClose = async () => {
    try { await getCurrentWindow().close(); } catch {}
  };

  // Hide all AI webviews, return to main UI
  const handleBackToMain = async () => {
    try {
      await invoke('hide_all_providers');
      setPreviewProvider(null);
    } catch {}
  };

  return (
    <div
      className="flex items-center h-10 border-b select-none shrink-0"
      style={{
        background: 'var(--bg-elevated)',
        borderBottomColor: 'var(--border-default)',
        transition: 'background-color 0.25s ease, border-color 0.25s ease'
      }}
      data-tauri-drag-region
    >
      {/* Left: App icon + title */}
      <div className="flex items-center gap-2.5 px-4">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center shadow-lg shadow-[#6366F1]/20">
          <Zap size={10} className="text-white" />
        </div>
        <span className="text-[13px] font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>MultiChat</span>
      </div>

      {/* Center: Mode switch tabs */}
      <div className="flex-1 flex items-center justify-center" data-tauri-drag-region>
        <div className="flex items-center rounded-lg p-0.5 gap-0.5"
          style={{ background: 'var(--bg-hover)' }}
        >
          <button
            onClick={() => setMode('sync')}
            className={cn(
              'px-4 py-1.5 text-[11px] rounded-md transition-all duration-200 font-medium',
              mode === 'sync'
                ? 'bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25'
                : ''
            )}
            style={mode === 'sync' ? {} : { color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => { if (mode !== 'sync') e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { if (mode !== 'sync') e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            ⚡ 同步模式
          </button>
          <button
            onClick={() => setMode('group')}
            className={cn(
              'px-4 py-1.5 text-[11px] rounded-md transition-all duration-200 font-medium',
              mode === 'group'
                ? 'bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25'
                : ''
            )}
            style={mode === 'group' ? {} : { color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => { if (mode !== 'group') e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { if (mode !== 'group') e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            💬 群聊模式
          </button>
        </div>
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center h-full">
        {/* Back to main UI button (only visible when previewing a provider) */}
        {previewProvider && (
          <button
            onClick={handleBackToMain}
            title="返回主界面"
            className="flex items-center gap-1 px-3 h-full text-[11px] transition-all duration-150 animate-pulse"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#6366F1'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <ArrowLeft size={12} />
            返回
          </button>
        )}
        {/* Settings button */}
        <button
          onClick={() => setShowSettings(true)}
          title="设置"
          className="flex items-center justify-center w-11 h-full transition-colors duration-150"
          style={{ '--hover-bg': 'var(--bg-hover)' } as React.CSSProperties}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
        >
          <Settings size={14} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-11 h-full transition-colors duration-150"
          onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
        >
          <Minus size={14} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-11 h-full transition-colors duration-150"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
        >
          {maximized ? (
            <Maximize2 size={12} style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <Square size={11} style={{ color: 'var(--text-tertiary)' }} />
          )}
        </button>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-full transition-colors duration-150 group"
          style={{ '--hover-bg': 'rgba(239,68,68,0.8)' } as React.CSSProperties}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.8)'}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
        >
          <X size={14} className="group-hover:text-white" style={{ color: 'var(--text-tertiary)', transition: 'color 0.15s' }} />
        </button>
      </div>
    </div>
  );
}
