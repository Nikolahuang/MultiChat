import React, { useRef, useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Copy, CheckCircle2, ExternalLink } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { PROVIDER_CATALOG } from '../../shared/providers';
import type { ChatMessage } from '../../shared/types';
import { cn } from '../lib/utils';
import MarkdownRenderer from './MarkdownRenderer';

export default function GroupChat() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const respondingStatus = useAppStore((s) => s.respondingStatus);
  const responses = useAppStore((s) => s.responses);
  const partialResponses = useAppStore((s) => s.partialResponses);
  const setPreviewProvider = useAppStore((s) => s.setPreviewProvider);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView(false); // instant scroll
  }, [activeGroup?.messages.length, responses, partialResponses]);

  // Build merged message list with real-time streaming
  const allMessages = useMemo(() => {
    if (!activeGroup) return [];

    const result: ChatMessage[] = [...activeGroup.messages];
    const seenStreaming = new Set<string>(); // Track streaming messages to avoid duplicates

    // Mark existing stream_ messages
    result.forEach((m) => {
      if (m.id.startsWith('stream_')) {
        seenStreaming.add(m.sender);
      }
    });

    // Add/update real-time responses for group members
    activeGroup.members.forEach((member) => {
      const isResponding = respondingStatus[member.providerId];
      const capturedContent = responses[member.providerId] || partialResponses[member.providerId] || '';

      // Find the last AI message from this provider in stored messages
      const lastStoredAiMsg = [...activeGroup.messages]
        .reverse()
        .find((m) => m.sender === member.providerId && m.role === 'ai' && !m.id.startsWith('stream_'));

      if (isResponding || capturedContent) {
        if (capturedContent) {
          // Check if we already have a streaming message for this provider
          const existingIdx = result.findIndex(
            (m) => m.sender === member.providerId && m.id.startsWith('stream_')
          );

          if (existingIdx >= 0) {
            // Update existing streaming message content
            result[existingIdx] = { ...result[existingIdx], content: capturedContent };
          } else if (!lastStoredAiMsg || lastStoredAiMsg.content !== capturedContent) {
            // New streaming message (only if different from last stored)
            result.push({
              id: `stream_${member.providerId}_${Date.now()}`,
              role: 'ai',
              sender: member.providerId,
              senderName: member.nickname,
              content: capturedContent,
              timestamp: Date.now(),
              providerId: member.providerId,
            });
            seenStreaming.add(member.providerId);
          }
        } else if (isResponding && !seenStreaming.has(member.providerId)) {
          // Show thinking indicator
          result.push({
            id: `thinking_${member.providerId}`,
            role: 'ai',
            sender: member.providerId,
            senderName: member.nickname,
            content: '',
            timestamp: Date.now(),
            providerId: member.providerId,
          });
          seenStreaming.add(member.providerId);
        }
      }
    });

    // Sort by timestamp
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  }, [activeGroup, respondingStatus, responses, partialResponses]);

  const getProvider = (providerId: string) =>
    PROVIDER_CATALOG.find((p) => p.id === providerId);

  // Copy message content
  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard not available */ }
  };

  // Open a member's WebView
  const handleOpenWebView = async (providerId: string) => {
    try {
      await invoke('create_webview', { providerId });
      await invoke('show_provider', { providerId });
      setPreviewProvider(providerId);
    } catch (err) {
      console.error('[GroupChat] Failed to open WebView:', err);
    }
  };

  // Format time for display
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  // Check if a time divider should be shown (>5 min gap)
  const shouldShowTimeDivider = (msgs: ChatMessage[], idx: number): boolean => {
    if (idx === 0) return true;
    const gap = msgs[idx].timestamp - msgs[idx - 1].timestamp;
    return gap > 5 * 60 * 1000; // 5 minutes
  };

  // ---- No group selected ----
  if (!activeGroup) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center space-y-4">
          <div className="text-5xl opacity-15">💬</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {groups.length === 0 ? '创建一个群聊开始吧' : '选择一个群聊'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>在左侧侧边栏创建或选择群聊</p>
        </div>
      </div>
    );
  }

  // Count responding members
  const respondingCount = activeGroup.members.filter(
    (m) => respondingStatus[m.providerId]
  ).length;

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{
        background: 'var(--bg-primary)',
        transition: 'background-color 0.25s ease'
      }}
    >
      {/* === Group Header: name + description === */}
      <div
        className="flex items-center justify-between px-4 py-1.5 border-b shrink-0"
        style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-default)'
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{activeGroup.name}</h3>
          {respondingCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[#6366F1]/70 shrink-0">
              <Loader2 size={9} className="animate-spin" />
              {respondingCount} 位回复中
            </span>
          )}
        </div>
        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{activeGroup.members.length} 人</span>
      </div>

      {/* === Member Bar: ALWAYS visible, each AI member clickable === */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border-b shrink-0 overflow-x-auto flex-wrap"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)'
        }}
      >
        {/* User indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#6366F1]/10 shrink-0 border border-[#6366F1]/15">
          <span className="text-xs">👤</span>
          <span className="text-[11px] text-[#6366F1]/70">我</span>
        </div>

        {/* Separator */}
        <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>·</span>

        {/* AI Members — each one is a button to open their WebView */}
        {activeGroup.members.map((m) => {
          const provider = getProvider(m.providerId);
          const isResp = respondingStatus[m.providerId];
          const hasResp = !!(responses[m.providerId] || partialResponses[m.providerId]);

          return (
            <button
              key={m.providerId}
              onClick={() => handleOpenWebView(m.providerId)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 shrink-0 border',
                isResp
                  ? 'bg-[#6366F1]/10 border-[#6366F1]/20'
                  : 'border-transparent'
              )}
              style={!isResp ? { background: 'var(--bg-hover)' } : undefined}
              title={`点击打开 ${m.nickname}${m.role ? `（${m.role}）` : ''} 的对话页面`}
            >
              {/* Icon */}
              <span className={cn(
                'text-sm leading-none',
                isResp ? 'opacity-100' : 'opacity-70'
              )}>
                {provider?.icon || '🤖'}
              </span>
              {/* Nickname */}
              <span className={cn(
                'text-[11px] font-medium whitespace-nowrap leading-none',
                isResp ? 'text-[#6366F1]' : ''
              )}
              style={!isResp ? { color: hasResp ? 'var(--text-secondary)' : 'var(--text-tertiary)' } : undefined}
              >
                {m.nickname}
              </span>
              {/* Status dot */}
              {isResp ? (
                <Loader2 size={9} className="text-[#6366F1] animate-spin shrink-0" />
              ) : hasResp ? (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400/70 shrink-0" />
              ) : null}
              {/* Role tag */}
              {m.role && (
                <span className="text-[9px] text-[#6366F1]/40 truncate max-w-[80px] hidden sm:inline-block leading-none">
                  ·{m.role}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* === Message Area === */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ background: 'var(--bg-primary)' }}
      >
        {allMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-4xl opacity-15">💭</div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>开始群聊吧！</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>发送消息，所有 AI 成员都会回复</p>
              <div className="flex items-center justify-center gap-1 mt-3">
                {activeGroup.members.slice(0, 5).map((m) => {
                  const provider = getProvider(m.providerId);
                  return (
                    <div
                      key={m.providerId}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm border border-solid"
                      style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' }}
                      title={m.nickname}
                    >
                      {provider?.icon || '🤖'}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {allMessages.map((msg, idx) => {
              // === Time divider ===
              const showTime = shouldShowTimeDivider(allMessages, idx);

              return (
                <React.Fragment key={msg.id}>
                  {showTime && (
                    <div className="flex items-center justify-center py-3">
                      <span
                        className="text-[10px] px-3 py-0.5 rounded-full"
                        style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
                      >
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )}

                  {/* === System message === */}
                  {msg.role === 'system' && (
                    <div className="flex justify-center py-1.5">
                      <span
                        className="text-[11px] px-3 py-0.5 rounded-full"
                        style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
                      >
                        {msg.content}
                      </span>
                    </div>
                  )}

                  {/* === User message (right-aligned blue bubble) === */}
                  {msg.role === 'user' && (
                    <div className="flex justify-end mb-2">
                      <div className="max-w-[70%] min-w-0">
                        <div className="bg-[#6366F1] rounded-2xl rounded-br-sm px-3.5 py-2 shadow-md shadow-[#6366F1]/10">
                          <p className="text-[13px] text-white whitespace-pre-wrap break-words leading-relaxed">
                            {msg.content}
                          </p>
                        </div>
                        <p className="text-[9px] mt-0.5 text-right pr-1" style={{ color: 'var(--text-muted)' }}>
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* === AI message (left-aligned with avatar) === */}
                  {msg.role === 'ai' && (() => {
                    const provider = getProvider(msg.sender);
                    const member = activeGroup.members.find((m) => m.providerId === msg.sender);
                    const isResponding = respondingStatus[msg.sender];
                    const isThinking = msg.id.startsWith('thinking_');
                    const isStreaming = msg.id.startsWith('stream_');

                    return (
                      <div className="flex items-start gap-2 mb-2 group/msg">
                        {/* Avatar */}
                          <button
                          onClick={() => handleOpenWebView(msg.sender)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 border border-solid hover:border-[#6366F1]/30 transition-all cursor-pointer mt-0.5"
                          style={{ borderColor: 'var(--border-default)', backgroundColor: `${provider?.color || '#161622'}15` }}
                          title={`打开 ${member?.nickname || provider?.name} 的对话页面`}
                        >
                          {provider?.icon || '🤖'}
                        </button>

                        <div className="max-w-[75%] min-w-0">
                          {/* Nickname row */}
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-[11px] font-medium"
                              style={{ color: provider?.color || 'rgba(255,255,255,0.5)' }}
                            >
                              {member?.nickname || provider?.name || 'AI'}
                            </span>
                            {isResponding && !isThinking && (
                              <span className="flex items-center gap-1">
                                <Loader2 size={8} className="text-[#6366F1] animate-spin" />
                                <span className="text-[9px] text-[#6366F1]/50">回复中</span>
                              </span>
                            )}
                            {isThinking && (
                              <span className="text-[9px] text-[#6366F1]/40">思考中</span>
                            )}
                          </div>

                          {/* Bubble */}
                          <div
                            className="rounded-2xl rounded-tl-sm px-3.5 py-2 ring-1 relative"
                            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
                          >
                            {isThinking ? (
                              <div className="flex items-center gap-2 py-1">
                                <div className="flex gap-0.5">
                                  <span className="w-1 h-1 rounded-full bg-[#6366F1]/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1 h-1 rounded-full bg-[#6366F1]/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1 h-1 rounded-full bg-[#6366F1]/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                              </div>
                            ) : (
                              <div className="text-[13px] leading-relaxed break-words" style={{ color: 'var(--text-primary)' }}>
                                <MarkdownRenderer content={msg.content} />
                                {isStreaming && (
                                  <span className="animate-pulse text-[#6366F1]">▊</span>
                                )}
                              </div>
                            )}

                            {/* Hover actions */}
                            {!isThinking && msg.content && (
                              <div className="absolute -right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-0.5 pl-2">
                                <button
                                  onClick={() => handleCopy(msg.content, msg.id)}
                                  className="p-1 rounded-md hover:bg-white/5 text-white/20 hover:text-white/50 transition-all ring-1"
                                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)' }}
                                  title="复制"
                                >
                                  {copiedId === msg.id ? (
                                    <CheckCircle2 size={10} className="text-green-400" />
                                  ) : (
                                    <Copy size={10} />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleOpenWebView(msg.sender)}
                                  className="p-1 rounded-md hover:bg-white/5 text-white/20 hover:text-white/50 transition-all ring-1"
                                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)' }}
                                  title="查看原始对话"
                                >
                                  <ExternalLink size={10} />
                                </button>
                              </div>
                            )}
                          </div>

                          <p className="text-[9px] mt-0.5 pl-1" style={{ color: 'var(--text-muted)' }}>
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
