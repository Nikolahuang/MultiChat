import React, { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Send, Paperclip, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { cn } from '../lib/utils';

interface InputBarProps {
  onSend: (text: string) => void;
}

export default function InputBar({ onSend }: InputBarProps) {
  const mode = useAppStore((s) => s.mode);
  const enabledProviders = useAppStore((s) => s.enabledProviders);
  const respondingStatus = useAppStore((s) => s.respondingStatus);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const groups = useAppStore((s) => s.groups);
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  // Only check responding status for relevant providers
  // In sync mode: check all enabled providers
  // In group mode: only check current group members
  const relevantRespondingIds = mode === 'group' && activeGroup
    ? activeGroup.members.map((m) => m.providerId)
    : enabledProviders;
  const anyRelevantResponding = relevantRespondingIds.some((id) => respondingStatus[id]);
  // Also do a global check but don't let non-relevant providers block input
  const anyGlobalResponding = Object.values(respondingStatus).some(Boolean);
  // Use the more restrictive check: block only if a RELEVANT provider is responding
  const anyResponding = anyRelevantResponding;

  const getPlaceholder = () => {
    if (anyResponding) return 'AI 正在回复中...';
    if (mode === 'sync') {
      const count = enabledProviders.length;
      return count === 0
        ? '请先在左侧选择 AI 平台...'
        : `发送消息到 ${count} 个 AI 平台...`;
    }
    if (!activeGroup) return '请先选择或创建群聊...';
    return `发送消息到「${activeGroup.name}」的 ${activeGroup.members.length} 位成员...`;
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || anyResponding) return;
    onSend(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend, anyResponding]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const canSend = text.trim().length > 0 && !anyResponding;

  // Determine target count for display
  const targetCount = mode === 'sync'
    ? enabledProviders.length
    : (activeGroup?.members.length || 0);

  return (
    <div className="shrink-0 border-t px-4 py-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-2.5">
          {/* Input container */}
          <div className="flex-1 rounded-xl border focus-within:border-[#6366F1]/30 transition-all duration-300 focus-within:shadow-lg focus-within:shadow-[#6366F1]/5"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' }}
          >
            <div className="flex items-end">
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                placeholder={getPlaceholder()}
                rows={1}
                disabled={anyResponding}
                className={cn(
                  'w-full bg-transparent text-[13px] px-4 py-2.5 outline-none overflow-hidden leading-relaxed resize-none',
                  anyResponding && 'opacity-50'
                )}
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 shrink-0 pb-0.5">
            {/* Target count badge */}
            {targetCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-[#6366F1]/60 bg-[#6366F1]/[0.06] px-2 py-1 rounded-md">
                <Sparkles size={9} />
                <span>{targetCount} AI</span>
              </div>
            )}

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0',
                canSend
                  ? 'bg-[#6366F1] hover:bg-[#5558E6] text-white shadow-lg shadow-[#6366F1]/25 hover:shadow-[#6366F1]/35 hover:scale-105 active:scale-95'
                  : 'cursor-not-allowed'
              )}
              style={!canSend ? { background: 'var(--bg-hover)', color: 'var(--text-muted)' } : undefined}
            >
              <Send size={14} className="translate-y-[0.5px]" />
            </button>
          </div>
        </div>

        {/* Helper text */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            Enter 发送 · Shift+Enter 换行
          </span>
          {anyResponding && (
            <span className="text-[9px] text-[#6366F1]/40 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[#6366F1] animate-pulse" />
              等待回复完成...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
