import React, { useRef, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Loader2, MessageSquare, Trash2, Copy, RefreshCw,
  CheckCircle2, Clock, XCircle, PanelLeftClose, PanelLeft,
  SendHorizontal, Bot, ChevronRight, ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { PROVIDER_CATALOG } from '../../shared/providers';
import { cn } from '../lib/utils';

export default function SyncMode() {
  const enabledProviders = useAppStore((s) => s.enabledProviders);
  const activeProviderTab = useAppStore((s) => s.activeProviderTab);
  const respondingStatus = useAppStore((s) => s.respondingStatus);
  const responses = useAppStore((s) => s.responses);
  const partialResponses = useAppStore((s) => s.partialResponses);
  const syncMessages = useAppStore((s) => s.syncMessages);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setPreviewProvider = useAppStore((s) => s.setPreviewProvider);
  const previewProvider = useAppStore((s) => s.previewProvider);
  const clearSyncMessages = useAppStore((s) => s.clearSyncMessages);

  // Local UI state
  const [showHistory, setShowHistory] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTabMenu, setShowTabMenu] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  // Ref for measuring the header area height (for WebView positioning)
  const headerAreaRef = useRef<HTMLDivElement>(null);

  // Measure header area + sidebar width and notify Rust so WebView positions correctly
  // DEBOUNCED to avoid flooding invoke calls during window resize
  useEffect(() => {
    let lastNotifiedOffset = -1; // Cache last sent top offset value
    let lastNotifiedSidebarW = -1.0; // Cache last sent sidebar width value
    let timer: ReturnType<typeof setTimeout> | null = null;

    const measureAndNotify = () => {
      const devicePixelRatio = window.devicePixelRatio || 1;

      // 1. Measure header area height (tab bar + info bar) for WebView y-position
      if (headerAreaRef.current) {
        const rect = headerAreaRef.current.getBoundingClientRect();
        // rect.top already accounts for the title bar position in the viewport
        // We need the physical pixel offset from window top to bottom of header area
        const physicalHeight = Math.round((rect.top + rect.height) * devicePixelRatio);

        // Skip if value hasn't changed (avoid unnecessary IPC)
        if (Math.abs(physicalHeight - lastNotifiedOffset) >= 2) {
          lastNotifiedOffset = physicalHeight;
          // Debounce: only send after 100ms of no changes (covers drag-resize scenarios)
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            invoke('set_webview_top_offset', { offset: physicalHeight }).catch(console.error);
          }, 100);
        }
      }

      // 2. Measure actual sidebar width for WebView x-position and width calculation
      // Use a more reliable method: find by w-64 (expanded) or w-11 (collapsed) + border-r
      const allDivs = document.querySelectorAll('div');
      let sidebarEl: Element | null = null;
      for (const el of Array.from(allDivs)) {
        const cls = el.className;
        if (typeof cls === 'string' && ((cls.includes('w-64') || cls.includes('w-11')) && cls.includes('border-r'))) {
          sidebarEl = el;
          break;
        }
      }
      if (sidebarEl) {
        const sbRect = sidebarEl.getBoundingClientRect();
        const physicalWidth = Math.round(sbRect.width * devicePixelRatio);
        // Only send if changed significantly (> 1px physical)
        if (Math.abs(physicalWidth - lastNotifiedSidebarW) > 1) {
          lastNotifiedSidebarW = physicalWidth;
          // Use separate debounce for sidebar (or share the same timer)
          invoke('set_sidebar_width', { width: physicalWidth }).catch(console.error);
        }
      }
    };

    measureAndNotify();
    const ro = new ResizeObserver(measureAndNotify);
    if (headerAreaRef.current) {
      ro.observe(headerAreaRef.current);
    }
    // Also observe the body/html for window-level changes
    window.addEventListener('resize', measureAndNotify);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener('resize', measureAndNotify);
    };
  }, [previewProvider]);

  useEffect(() => {
    // Use instant scroll for better perf; smooth animation causes layout thrashing
    historyEndRef.current?.scrollIntoView(false);
  }, [syncMessages]);

  // Click a tab → switch to that AI's conversation (show its webview)
  const handleTabClick = async (id: string) => {
    setActiveTab(id);
    setShowTabMenu(null);
    try {
      await invoke('create_webview', { providerId: id });
      await invoke('show_provider', { providerId: id });
      setPreviewProvider(id);
    } catch (err) {
      console.error('[SyncMode] Failed to show provider:', id, err);
    }
  };

  // Close webview preview
  const handleClosePreview = async () => {
    try {
      await invoke('hide_all_providers');
      setPreviewProvider(null);
    } catch { /* ignore */ }
  };

  // Copy a provider's response to clipboard
  const handleCopyResponse = async (providerId: string) => {
    const content = responses[providerId] || partialResponses[providerId] || '';
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(providerId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard may not be available */ }
  };

  // Resend last message to specific providers
  const handleResend = async (providerIds?: string[]) => {
    if (syncMessages.length === 0) return;
    const lastMsg = syncMessages.filter(m => m.role === 'user').pop();
    if (!lastMsg) return;
    const targets = providerIds || enabledProviders;
    try {
      await invoke('broadcast_message', { text: lastMsg.content, targets });
    } catch (err) {
      console.error('[SyncMode] Resend failed:', err);
    }
    setShowTabMenu(null);
  };

  // Stop all responding providers
  const handleStopAll = async () => {
    try {
      await invoke('hide_all_providers');
      const state = useAppStore.getState();
      Object.keys(state.respondingStatus).forEach(id => {
        if (state.respondingStatus[id]) {
          useAppStore.getState().setResponding(id, false);
        }
      });
    } catch { /* ignore */ }
    setShowTabMenu(null);
  };

  // Response stats
  const totalTargets = enabledProviders.length;
  const responseCount = Object.keys(responses).filter(k => enabledProviders.includes(k)).length;
  const respondingCount = Object.keys(respondingStatus).filter(k => respondingStatus[k] && enabledProviders.includes(k)).length;
  const failedCount = totalTargets - responseCount - respondingCount;

  // Get display name for preview provider
  const previewDisplayName = previewProvider
    ? (PROVIDER_CATALOG.find(p => p.id === previewProvider)?.name || previewProvider)
    : '';

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* === Message History Sidebar — hidden when previewing webview to save space === */}
      <div className={cn(
        'flex flex-col border-r transition-all duration-300 shrink-0',
        showHistory && !previewProvider ? 'w-64' : 'w-0 overflow-hidden'
      )}
        style={{ borderColor: 'var(--border-default)', background: 'var(--bg-secondary)' }}
      >
        {!previewProvider && (
          <>
            {/* History header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0" style={{ borderBottomColor: 'var(--border-default)' }}>
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>消息记录</span>
              <div className="flex items-center gap-1">
                {syncMessages.length > 0 && (
                  <button
                    onClick={() => clearSyncMessages()}
                    className="p-1 rounded-md hover:bg-red-500/10 text-red-400/70 hover:text-red-400 transition-all duration-200"
                    title="清空对话"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded-md transition-all duration-200"
                  style={{ color: 'var(--text-muted)', '--tw-bg-opacity': undefined } as React.CSSProperties}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                  title="收起历史"
                >
                  <PanelLeftClose size={11} />
                </button>
              </div>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto py-1">
              {syncMessages.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无消息</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>发送消息后这里会显示记录</p>
                </div>
              ) : (
                <div className="space-y-0.5 px-2">
                  {syncMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-lg px-3 py-2 text-xs"
                      style={{
                        background: msg.role === 'user' ? 'rgba(99,102,241,0.08)' : 'var(--bg-hover)',
                        color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                        fontStyle: msg.role !== 'user' ? 'italic' : undefined
                      }}
                    >
                      <div
                        className="text-[9px] mb-1"
                        style={{ color: msg.role === 'user' ? 'rgba(99,102,241,0.6)' : 'var(--text-muted)' }}
                      >
                        {msg.role === 'user' ? (
                          <span className="flex items-center gap-1">
                            <SendHorizontal size={8} /> 我 · {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Bot size={8} /> 系统 · {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="leading-relaxed break-words line-clamp-4">{msg.content}</div>
                    </div>
                  ))}
                  <div ref={historyEndRef} />
                </div>
              )}
            </div>

            {/* History footer stats */}
              {syncMessages.length > 0 && (
                <div className="px-3 py-2 border-t shrink-0" style={{ borderTopColor: 'var(--border-default)' }}>
                  <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {syncMessages.filter(m => m.role === 'user').length} 条消息 · {new Date().toLocaleDateString('zh-CN')}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* === Main Content Area === */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header area: tab bar + info bar — measured for WebView positioning */}
        <div ref={headerAreaRef} className="shrink-0 z-20 relative">
          {/* Tab bar */}
          <div className="flex items-center border-b bg-[#0f0f17]/90 backdrop-blur-md shrink-0 overflow-x-auto z-10" style={{ borderBottomColor: 'var(--border-default)' }}>
            {/* History toggle — hidden when previewing */}
            {!previewProvider && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  'flex items-center px-2 py-2.5 border-r shrink-0 transition-colors',
                  showHistory ? 'text-[#6366F1]' : ''
                )}
                style={{
                  borderColor: 'var(--border-default)',
                  color: showHistory ? undefined : 'var(--text-muted)'
                }}
                onMouseEnter={(e) => { if (!showHistory) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={(e) => { if (!showHistory) e.currentTarget.style.color = 'var(--text-muted)'; }}
                title={showHistory ? '收起历史记录' : '展开历史记录'}
              >
                <PanelLeft size={13} />
              </button>
            )}

            {/* Provider tabs */}
            {enabledProviders.map((id) => {
              const provider = PROVIDER_CATALOG.find((p) => p.id === id);
              if (!provider) return null;
              const isActive = activeProviderTab === id;
              const isResp = respondingStatus[id];
              const hasResp = !!(responses[id] || partialResponses[id]);
              const isOpen = showTabMenu === id;

              return (
                <div key={id} className="relative shrink-0">
                  <button
                    onClick={() => handleTabClick(id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setShowTabMenu(isOpen ? null : id);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 transition-all duration-200 whitespace-nowrap group',
                      isActive
                        ? 'border-[#6366F1]'
                        : 'border-transparent'
                    )}
                    style={{
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: isActive ? 'var(--bg-hover)' : undefined
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <span className="text-sm">{provider.icon}</span>
                    <span>{provider.name}</span>
                    {isResp && <Loader2 size={11} className="text-[#6366F1] animate-spin" />}
                    {hasResp && !isResp && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400/80 shrink-0" />
                    )}
                    {previewProvider !== id && (
                      <ChevronRight
                        size={10}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTabMenu(isOpen ? null : id);
                        }}
                        className={cn(
                          'opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity cursor-pointer ml-0.5',
                          isOpen && '!opacity-100 rotate-90'
                        )}
                      />
                    )}
                  </button>

                  {/* Tab dropdown menu */}
                  {isOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setShowTabMenu(null)}
                      />
                      <div
                        className="absolute top-full right-1 mt-1 z-40 w-44 border rounded-lg shadow-xl overflow-hidden"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-lg)' }}
                      >
                        <div className="py-1">
                          {hasResp && (
                            <button
                              onClick={() => handleCopyResponse(id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                            >
                              {copiedId === id ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                              复制回复内容
                            </button>
                          )}
                          {syncMessages.length > 0 && (
                            <button
                              onClick={() => handleResend([id])}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                            >
                              <RefreshCw size={12} /> 重新发送到此平台
                            </button>
                          )}
                          {hasResp && (
                            <div className="border-t my-1" style={{ borderTopColor: 'var(--border-default)' }} />
                          )}
                          {hasResp && (
                            <button
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                              onClick={() => setShowTabMenu(null)}
                            >
                              <MessageSquare size={12} /> 查看完整回复
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Right-side actions in tab bar */}
            <div className="ml-auto flex items-center gap-1 pr-2 pl-2 shrink-0">
              {/* Response status indicator */}
              <div className="flex items-center gap-1.5 text-[10px] mr-1" title={`${responseCount}/${totalTargets} 已回复`}>
                {responseCount > 0 && (
                  <span className="flex items-center gap-0.5 text-green-400/70">
                    <CheckCircle2 size={9} /> {responseCount}
                  </span>
                )}
                {respondingCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[#6366F1]">
                    <Loader2 size={9} className="animate-spin" /> {respondingCount}
                  </span>
                )}
                {failedCount > 0 && responseCount + respondingCount < totalTargets && (
                  <span className="flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                    <XCircle size={9} /> {failedCount}
                  </span>
                )}
              </div>

              {/* Stop / Resend / Clear */}
              {respondingCount > 0 && (
                <button
                  onClick={handleStopAll}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-red-500/10 text-red-400/70 hover:bg-red-500/20 transition-colors"
                  title="停止所有生成"
                >
                  <XCircle size={10} /> 停止
                </button>
              )}
              {!respondingCount && syncMessages.length > 0 && failedCount > 0 && (
                <button
                  onClick={() => handleResend()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                  title="重新发送到未响应的平台"
                >
                  <RefreshCw size={10} /> 重发
                </button>
              )}
              {syncMessages.length > 0 && !previewProvider && (
                <button
                  onClick={() => clearSyncMessages()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = '#F87171'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                  title="清空对话记录"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Compact info row — only shown when previewing a webview */}
          {previewProvider && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#12121c]/95 backdrop-blur-sm border-b shrink-0" style={{ borderBottomColor: 'var(--border-default)' }}>
              <ExternalLink size={12} className="text-[#6366F1]/70 shrink-0" />
              <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>当前对话</span>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{previewDisplayName}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              {respondingStatus[previewProvider] ? (
                <span className="flex items-center gap-1 text-[10px] text-[#6366F1]">
                  <Loader2 size={9} className="animate-spin" /> 回复中...
                </span>
              ) : responses[previewProvider] ? (
                <span className="flex items-center gap-1 text-[10px] text-green-400/60">
                  <CheckCircle2 size={9} /> 已回复
                </span>
              ) : (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>等待中</span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {responses[previewProvider] && (
                  <button
                    onClick={() => handleCopyResponse(previewProvider)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                    title="复制回复"
                  >
                    {copiedId === previewProvider ? <CheckCircle2 size={10} className="text-green-400" /> : <Copy size={10} />}
                    复制
                  </button>
                )}
                <button
                  onClick={handleClosePreview}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                  title="关闭预览"
                >
                  ✕ 关闭
                </button>
              </div>
            </div>
          )}
        </div>{/* End of headerAreaRef */}

        {/* Content area */}
        {!previewProvider ? (
          /* No webview — show welcome placeholder */
          <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center space-y-4">
                <div className="text-6xl opacity-15">{'💬'}</div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>点击上方标签切换 AI 对话</p>
                <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  选择一个 AI 平台开始对话，可同时向多个平台发送消息并对比回复
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Webview is active — render NOTHING here so WebView has full space */
          /* WebView is positioned by Rust using the measured headerAreaRef height as y-offset */
          <div className="flex-1 relative" style={{ background: '#000' }} />
        )}
      </div>
    </div>
  );
}
