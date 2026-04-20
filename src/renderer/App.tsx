import React, { useEffect, useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import SyncMode from './components/SyncMode';
import GroupChat from './components/GroupChat';
import InputBar from './components/InputBar';
import GroupCreateDialog from './components/GroupCreateDialog';
import SettingsDialog from './components/SettingsDialog';
import { useAppStore, isHydrated, onHydrated } from './stores/appStore';
import { genId } from './lib/utils';
import type { ChatMessage, AiProvider } from '../shared/types';

export default function App() {
  const [hydrated, setHydrated] = useState(isHydrated());
  const mode = useAppStore((s) => s.mode);
  const enabledProviders = useAppStore((s) => s.enabledProviders);
  const setEnabledProviders = useAppStore((s) => s.setEnabledProviders);
  const setLoginStatus = useAppStore((s) => s.setLoginStatus);
  const setResponding = useAppStore((s) => s.setResponding);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const addSyncMessage = useAppStore((s) => s.addSyncMessage);
  const setMaximized = useAppStore((s) => s.setMaximized);
  const addGroupMessage = useAppStore((s) => s.addGroupMessage);
  const handleAiResponse = useAppStore((s) => s.handleAiResponse);
  const handleAiPartialResponse = useAppStore((s) => s.handleAiPartialResponse);
  const markSendFailed = useAppStore((s) => s.markSendFailed);
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const activeProviderTab = useAppStore((s) => s.activeProviderTab);
  const previewProvider = useAppStore((s) => s.previewProvider);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const initDone = useRef(false);

  // Wait for zustand persist hydration before rendering the app
  useEffect(() => {
    if (isHydrated()) {
      setHydrated(true);
    } else {
      onHydrated(() => setHydrated(true));
    }
  }, []);

  // Apply persisted theme on startup (after hydration)
  // This ensures the correct CSS variables are set before first render
  const themeApplied = useRef(false);
  useEffect(() => {
    if (!hydrated || themeApplied.current) return;
    themeApplied.current = true;
    setTheme(useAppStore.getState().theme);
  }, [hydrated, setTheme]);

  // Setup Tauri event listeners
  useEffect(() => {
    const cleanups: Promise<UnlistenFn>[] = [];

    cleanups.push(
      listen<{ providerId: string; loggedIn: boolean }>('login-changed', (event) => {
        setLoginStatus(event.payload.providerId, event.payload.loggedIn);
      })
    );

    cleanups.push(
      listen<{ providerId: string; responding: boolean }>('responding-changed', (event) => {
        setResponding(event.payload.providerId, event.payload.responding);
      })
    );

    cleanups.push(
      listen<{ providerId: string; content: string }>('ai-response', (event) => {
        handleAiResponse(event.payload);
      })
    );

    cleanups.push(
      listen<{ providerId: string; content: string }>('ai-partial-response', (event) => {
        handleAiPartialResponse(event.payload);
      })
    );

    cleanups.push(
      listen('bridge-ready', () => {})
    );

    // Listen for send failures from Rust backend
    cleanups.push(
      listen<{ providerId: string; reason: string }>('send-failed', (event) => {
        markSendFailed(event.payload.providerId, event.payload.reason);
      })
    );

    cleanups.push(
      listen('tauri://resize', async () => {
        try {
          const maximized = await getCurrentWindow().isMaximized();
          setMaximized(maximized);
        } catch {}
      })
    );

    return () => {
      cleanups.forEach((p) => p.then((fn) => fn()));
    };
  }, [setLoginStatus, setResponding, setMaximized, handleAiResponse, handleAiPartialResponse, markSendFailed]);

  // Initialize provider list only (no webviews until needed)
  // Runs once after hydration is done — does NOT depend on reactive state to avoid re-triggering
  useEffect(() => {
    if (!hydrated) return;
    if (initDone.current) return;
    initDone.current = true;

    (async () => {
      try {
        const providers = await invoke<AiProvider[]>('get_providers');
        const providerIds = providers.map((p) => p.id);

        // Read current state at init time (not from closure)
        const currentEnabled = useAppStore.getState().enabledProviders;
        const currentTab = useAppStore.getState().activeProviderTab;

        // Only set enabled providers if not already persisted
        if (currentEnabled.length === 0) {
          setEnabledProviders(providerIds);
        }

        // Just init provider list - don't create any webviews yet!
        await invoke('init_webviews');

        if (!currentTab && providerIds.length > 0) {
          setActiveTab(providerIds[0]);
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
      }
    })();
  }, [hydrated, setEnabledProviders, setActiveTab]);

  // Handle message sending
  const handleSend = useCallback(
    async (text: string) => {
      const msgId = genId('msg');
      const now = Date.now();

      if (mode === 'sync') {
        const userMsg: ChatMessage = {
          id: msgId,
          role: 'user',
          sender: 'user',
          senderName: '我',
          content: text,
          timestamp: now,
        };
        addSyncMessage(userMsg);

        try {
          const targets = enabledProviders;
          if (targets.length > 0) {
            await invoke('broadcast_message', { text, targets });
          }
        } catch (err) {
          console.error('Broadcast failed:', err);
        }
      } else if (mode === 'group') {
        const group = groups.find((g) => g.id === activeGroupId);
        if (!group) return;

        // Add user message to group immediately
        const userMsg: ChatMessage = {
          id: msgId,
          role: 'user',
          sender: 'user',
          senderName: '我',
          content: text,
          timestamp: now,
        };
        addGroupMessage(group.id, userMsg);

        // Build context text for AI members
        // This includes group description, member roles, and recent conversation history
        // so AIs can understand the group context and see each other's responses
        const recentMessages = group.messages.slice(-20);
        let contextText = '';

        // Group context header
        if (group.description || group.members.some((m) => m.role)) {
          contextText += `[群聊上下文]\n`;
          if (group.description) {
            contextText += `【群聊目标】: ${group.description}\n`;
          }
          const roleInfo = group.members
            .filter((m) => m.role)
            .map((m) => `${m.nickname}（${m.providerId}）: ${m.role}`)
            .join('\n');
          if (roleInfo) {
            contextText += `【成员角色】:\n${roleInfo}\n`;
          }
          contextText += '\n';
        }

        // Recent conversation history (so AIs can see each other's responses)
        if (recentMessages.length > 0) {
          contextText += `【最近对话历史】:\n`;
          for (const msg of recentMessages) {
            if (msg.role === 'user') {
              contextText += `用户: ${msg.content}\n`;
            } else if (msg.role === 'ai') {
              const senderName = msg.senderName || msg.sender || 'AI';
              contextText += `${senderName}: ${msg.content}\n`;
            }
          }
          contextText += '\n';
        }

        // The actual new message
        contextText += `【用户新消息】: ${text}`;

        const targets = group.members.map((m) => m.providerId);
        try {
          if (targets.length > 0) {
            await invoke('broadcast_message', { text: contextText, targets });
          }
        } catch (err) {
          console.error('Broadcast failed:', err);
        }
      }
    },
    [mode, enabledProviders, groups, activeGroupId, addSyncMessage, addGroupMessage]
  );

  // Show loading screen until persist hydration completes
  if (!hydrated) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-sm"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
          <div className="w-4 h-4 border-2 border-t-[#6366F1] rounded-full animate-spin"
            style={{ borderColor: 'var(--accent-glow) var(--accent-glow) var(--accent-glow) transparent' }}
          />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        transition: 'background-color 0.25s ease, color 0.2s ease'
      }}
      data-tauri-drag-region
    >
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Always show React UI - SyncMode/GroupChat handles webview display internally */}
          <>
            {mode === 'sync' ? <SyncMode /> : <GroupChat />}
            {/* Hide InputBar when a webview is being previewed (user types in the webview directly) */}
            {!previewProvider && <InputBar onSend={handleSend} />}
          </>
        </div>
      </div>

      {/* Dialogs */}
      {useAppStore((s) => s.showGroupCreateDialog) && <GroupCreateDialog />}
      {useAppStore((s) => s.showSettingsDialog) && <SettingsDialog />}
    </div>
  );
}
