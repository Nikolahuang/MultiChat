import React from 'react';
import { Plus, ChevronLeft, ChevronRight, Loader2, LogIn, LogOut, ExternalLink, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { PROVIDER_CATALOG } from '../../shared/providers';
import { cn } from '../lib/utils';

export default function Sidebar() {
  const mode = useAppStore((s) => s.mode);
  const enabledProviders = useAppStore((s) => s.enabledProviders);
  const loginStatus = useAppStore((s) => s.loginStatus);
  const respondingStatus = useAppStore((s) => s.respondingStatus);
  const responses = useAppStore((s) => s.responses);
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const previewProvider = useAppStore((s) => s.previewProvider);
  const toggleProvider = useAppStore((s) => s.toggleProvider);
  const failedProviders = useAppStore((s) => s.failedProviders);
  const clearSendFailed = useAppStore((s) => s.clearSendFailed);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setShowGroupCreateDialog = useAppStore((s) => s.setShowGroupCreateDialog);
  const setPreviewProvider = useAppStore((s) => s.setPreviewProvider);

  // Toggle webview preview for a provider (lazy-loads on demand)
  const handlePreviewToggle = async (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation();
    try {
      if (previewProvider === providerId) {
        // Already showing this one → hide it
        await invoke('hide_all_providers');
        setPreviewProvider(null);
      } else {
        // Ensure this provider's webview is created before showing
        await invoke('create_webview', { providerId });
        // Show the selected provider's webview
        await invoke('show_provider', { providerId });
        setPreviewProvider(providerId);
      }
    } catch (err) {
      console.error('Failed to toggle provider:', err);
    }
  };

  if (sidebarCollapsed) {
    return (
      <div
        className="flex flex-col items-center w-11 border-r shrink-0 pt-2 gap-1.5"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)',
          transition: 'background-color 0.25s ease, border-color 0.25s ease'
        }}
      >
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md transition-colors duration-200 mb-1"
          style={{ '--tw-bg-opacity': undefined } as React.CSSProperties}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
          title="展开侧边栏"
        >
          <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
        {PROVIDER_CATALOG.map((p) => {
          const enabled = enabledProviders.includes(p.id);
          const loggedIn = loginStatus[p.id];
          const isPreviewing = previewProvider === p.id;
          return (
            <button
              key={p.id}
              onClick={() => !isPreviewing && handlePreviewToggle({ stopPropagation: () => {} } as React.MouseEvent, p.id)}
              title={`${p.name}${isPreviewing ? ' (点击关闭)' : ' - 点击预览'}`}
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all duration-200 relative',
                enabled ? '' : 'opacity-40 hover:opacity-70',
                isPreviewing ? 'ring-2 ring-[#6366F1]' : ''
              )}
              style={{ background: enabled ? 'var(--bg-hover)' : undefined }}
            >
              {p.icon}
              {loggedIn === true && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-solid" style={{ borderColor: 'var(--bg-primary)' }} />
              )}
              {isPreviewing && (
                <span className="absolute inset-0 rounded-lg border-2 border-[#6366F1]" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col w-64 border-r shrink-0 overflow-hidden"
      style={{
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-default)',
        transition: 'background-color 0.25s ease, border-color 0.25s ease'
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <span
          className="text-[11px] font-medium uppercase tracking-widest"
          style={{ color: 'var(--text-tertiary)' }}
        >AI 平台</span>
        <div className="flex items-center gap-1">
          {/* Quick back button when previewing */}
          {previewProvider && (
            <button
              onClick={() => {
                invoke('hide_all_providers').catch(console.error);
                setPreviewProvider(null);
              }}
              className="p-1 rounded-md hover:bg-[#6366F1]/20 transition-colors duration-200 text-[#6366F1]"
              title="关闭预览"
            >
              <ExternalLink size={12} />
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 rounded-md transition-colors duration-200"
            style={{ '--tw-bg-opacity': undefined } as React.CSSProperties}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
            title="收起侧边栏"
          >
            <ChevronLeft size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Provider list */}
      <div className="flex-1 overflow-y-auto py-1">
        {PROVIDER_CATALOG.map((p) => {
          const enabled = enabledProviders.includes(p.id);
          const loggedIn = loginStatus[p.id];
          const responding = respondingStatus[p.id];
          const hasResponse = !!responses[p.id];
          const isPreviewing = previewProvider === p.id;
          const failedReason = failedProviders[p.id];

          return (
            <div
              key={p.id}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 transition-all duration-200 cursor-pointer',
                enabled ? '' : 'opacity-50 hover:opacity-80',
                isPreviewing && 'bg-[#6366F1]/10'
              )}
              style={
                enabled
                  ? { borderLeft: `2px solid ${isPreviewing ? '#6366F1' : p.color}40`, background: 'var(--bg-hover)' }
                  : { borderLeft: '2px solid transparent' }
              }
              onClick={() => handlePreviewToggle({ stopPropagation: () => {} } as unknown as React.MouseEvent, p.id)}
            >
              {/* Checkbox */}
              <div
                className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all duration-200',
                  enabled
                    ? 'bg-[#6366F1] border-[#6366F1]'
                    : ''
                )}
                style={!enabled ? { borderColor: 'var(--border-default)' } : undefined}
                onClick={(e) => { e.stopPropagation(); toggleProvider(p.id); }}
              >
                {enabled && (
                  <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              {/* Icon + Name */}
              <span className="text-sm shrink-0">{p.icon}</span>
              <span className={cn(
                'text-[12px] truncate flex-1',
                isPreviewing ? 'font-medium' : ''
              )} style={{
                color: isPreviewing ? '#fff' : 'var(--text-secondary)'
              }}>{p.name}</span>

              {/* Status indicators */}
              <div className="shrink-0 flex items-center gap-0.5">
                {failedReason ? (
                  <span
                    className="flex items-center gap-0.5 cursor-pointer text-red-400/80 hover:text-red-400"
                    title={`发送失败: ${failedReason}（点击重试）`}
                    onClick={(e) => { e.stopPropagation(); clearSendFailed(p.id); }}
                  >
                    <AlertCircle size={10} />
                  </span>
                ) : responding ? (
                  <Loader2 size={10} className="text-[#6366F1] animate-spin" />
                ) : loggedIn === true ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400/80" title="已登录" />
                ) : loggedIn === false ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400/50" title="未登录" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
                )}

                {/* Preview toggle indicator */}
                {isPreviewing ? (
                  <span className="w-4 h-4 rounded flex items-center justify-center bg-[#6366F1]/20 text-[#6366F1]" title="正在预览中">
                    <ExternalLink size={9} />
                  </span>
                ) : (
                  <button
                    onClick={(e) => handlePreviewToggle(e, p.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-200"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                    title="打开预览（登录/设置）"
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Group chat section */}
      {mode === 'group' && (
        <div style={{ borderTop: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span
              className="text-[11px] font-medium uppercase tracking-widest"
              style={{ color: 'var(--text-tertiary)' }}
            >群聊</span>
            <button
              onClick={() => setShowGroupCreateDialog(true)}
              className="p-1 rounded-md transition-colors duration-200"
              style={{ '--tw-bg-opacity': undefined } as React.CSSProperties}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
              title="新建群聊"
            >
              <Plus size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto pb-1">
            {groups.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                暂无群聊，点击 + 创建
              </div>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 transition-all duration-200 text-left',
                  activeGroupId === g.id ? 'bg-[#6366F1]/10' : ''
                )}
                style={activeGroupId !== g.id ? { '--tw-bg-opacity': undefined } as React.CSSProperties : undefined}
                onMouseEnter={(e) => { if (activeGroupId !== g.id) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (activeGroupId !== g.id) e.currentTarget.style.backgroundColor = ''; }}
              >
                <div className="flex -space-x-1 shrink-0">
                  {g.members.slice(0, 3).map((m) => {
                    const provider = PROVIDER_CATALOG.find((p) => p.id === m.providerId);
                    return (
                      <div
                        key={m.providerId}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] border border-solid"
                        style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--bg-primary)' }}
                      >
                        {provider?.icon || '🤖'}
                      </div>
                    );
                  })}
                  {g.members.length > 3 && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] border border-solid" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', borderColor: 'var(--bg-primary)' }}>
                      +{g.members.length - 3}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{g.name}</div>
                  <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{g.members.length} 位成员</div>
                </div>
                {activeGroupId === g.id && (
                  <div className="w-1 h-1 rounded-full bg-[#6366F1] shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer stats */}
      <div
        className="px-3 py-2"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center justify-between text-[9px]" style={{ color: 'var(--text-muted)' }}>
          <span>{enabledProviders.length} 已启用</span>
          <div className="flex items-center gap-2">
            {Object.keys(loginStatus).length > 0 ? (
              <span>{Object.values(loginStatus).filter(Boolean).length}/{Object.keys(loginStatus).length} 已登录</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            )}
            {previewProvider && (
              <span className="text-[#6366F1]/60">▶ 预览中</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
