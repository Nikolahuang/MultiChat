import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage, ChatGroup } from '../../shared/types';

interface AiResponseData {
  providerId: string;
  content: string;
}

// ============ Constants ============
const MAX_SYNC_MESSAGES = 200;      // Max sync mode messages (keep memory bounded)
const MAX_GROUP_MESSAGES = 300;     // Max messages per group

// Track hydration state so the app can show a loading screen until persist rehydration is done
let _hydrated = false;
const hydrationListeners: Array<() => void> = [];

export function isHydrated() {
  return _hydrated;
}

export function onHydrated(cb: () => void) {
  if (_hydrated) {
    cb();
  } else {
    hydrationListeners.push(cb);
  }
}

interface AppState {
  mode: 'sync' | 'group';
  enabledProviders: string[];
  loginStatus: Record<string, boolean>;
  respondingStatus: Record<string, boolean>;
  responses: Record<string, string>;
  partialResponses: Record<string, string>;

  // Sync mode
  syncMessages: ChatMessage[];
  activeProviderTab: string | null;

  // Group mode
  groups: ChatGroup[];
  activeGroupId: string | null;
  showGroupCreateDialog: boolean;

  // UI
  theme: 'light' | 'dark';
  maximized: boolean;
  sidebarCollapsed: boolean;
  showSettingsDialog: boolean;

  // Send failure tracking
  failedProviders: Record<string, string>; // providerId -> reason

  // Preview (webview overlay)
  previewProvider: string | null;

  // Actions
  setMode: (mode: 'sync' | 'group') => void;
  setEnabledProviders: (ids: string[]) => void;
  toggleProvider: (id: string) => void;
  setLoginStatus: (id: string, loggedIn: boolean) => void;
  setResponding: (id: string, responding: boolean) => void;
  setResponse: (id: string, response: string) => void;
  setPartialResponse: (id: string, response: string) => void;
  clearPartialResponse: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  addSyncMessage: (msg: ChatMessage) => void;
  clearSyncMessages: () => void;
  addGroup: (group: ChatGroup) => void;
  updateGroup: (group: ChatGroup) => void;
  deleteGroup: (id: string) => void;
  setActiveGroup: (id: string | null) => void;
  addGroupMessage: (groupId: string, msg: ChatMessage) => void;
  setMaximized: (v: boolean) => void;
  toggleSidebar: () => void;
  setShowGroupCreateDialog: (show: boolean) => void;
  setPreviewProvider: (id: string | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setShowSettingsDialog: (show: boolean) => void;
  markSendFailed: (providerId: string, reason: string) => void;
  clearSendFailed: (providerId: string) => void;

  // AI response handler
  handleAiResponse: (data: AiResponseData) => void;
  handleAiPartialResponse: (data: AiResponseData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: 'sync',
      enabledProviders: [],
      loginStatus: {},
      respondingStatus: {},
      responses: {},
      partialResponses: {},

      syncMessages: [],
      activeProviderTab: null,

      groups: [],
      activeGroupId: null,
      showGroupCreateDialog: false,

      theme: 'dark',
      maximized: false,
      sidebarCollapsed: false,
      previewProvider: null,
      failedProviders: {},
      showSettingsDialog: false,

      // --- Actions ---
      setMode: (mode) => set({ mode, activeProviderTab: null }),

      setEnabledProviders: (ids) => set({ enabledProviders: ids }),

      toggleProvider: (id) =>
        set((s) => {
          const exists = s.enabledProviders.includes(id);
          const next = exists
            ? s.enabledProviders.filter((p) => p !== id)
            : [...s.enabledProviders, id];
          const activeProviderTab = exists && s.activeProviderTab === id ? null : s.activeProviderTab;
          return { enabledProviders: next, activeProviderTab };
        }),

      setLoginStatus: (id, loggedIn) =>
        set((s) => ({ loginStatus: { ...s.loginStatus, [id]: loggedIn } })),

      setResponding: (id, responding) =>
        set((s) => ({ respondingStatus: { ...s.respondingStatus, [id]: responding } })),

      setResponse: (id, response) =>
        set((s) => ({ responses: { ...s.responses, [id]: response } })),

      setPartialResponse: (id, response) =>
        set((s) => ({ partialResponses: { ...s.partialResponses, [id]: response } })),

      clearPartialResponse: (id) =>
        set((s) => {
          const pr = { ...s.partialResponses };
          delete pr[id];
          return { partialResponses: pr };
        }),

      setActiveTab: (id) => set({ activeProviderTab: id }),

      addSyncMessage: (msg) =>
        set((s) => {
          const msgs = [...s.syncMessages, msg];
          // Trim old messages to prevent memory growth
          if (msgs.length > MAX_SYNC_MESSAGES) {
            return { syncMessages: msgs.slice(msgs.length - MAX_SYNC_MESSAGES) };
          }
          return { syncMessages: msgs };
        }),

      clearSyncMessages: () =>
        set({ syncMessages: [], responses: {}, partialResponses: {} }),

      addGroup: (group) =>
        set((s) => ({ groups: [...s.groups, group], activeGroupId: group.id })),

      updateGroup: (group) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === group.id ? group : g)),
        })),

      deleteGroup: (id) =>
        set((s) => {
          const filtered = s.groups.filter((g) => g.id !== id);
          const activeGroupId = s.activeGroupId === id
            ? (filtered.length > 0 ? filtered[0].id : null)
            : s.activeGroupId;
          return { groups: filtered, activeGroupId };
        }),

      setActiveGroup: (id) => set({ activeGroupId: id }),

      addGroupMessage: (groupId, msg) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? (() => {
              const msgs = [...g.messages, msg];
              // Trim old messages to prevent memory growth
              if (msgs.length > MAX_GROUP_MESSAGES) {
                return { ...g, messages: msgs.slice(msgs.length - MAX_GROUP_MESSAGES), updatedAt: Date.now() };
              }
              return { ...g, messages: msgs, updatedAt: Date.now() };
            })() : g
          ),
        })),

      setMaximized: (v) => set({ maximized: v }),

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setShowGroupCreateDialog: (show) => set({ showGroupCreateDialog: show }),

      setPreviewProvider: (id) => set({ previewProvider: id }),

      setTheme: (theme) => {
        // Apply theme class to <html> element for CSS variable switching
        const root = document.documentElement;
        if (theme === 'light') {
          root.setAttribute('data-theme', 'light');
          root.classList.add('light-theme');
        } else {
          root.removeAttribute('data-theme');
          root.classList.remove('light-theme');
        }
        set({ theme });
      },

      setShowSettingsDialog: (show) => set({ showSettingsDialog: show }),

      markSendFailed: (providerId, reason) =>
        set((s) => ({ failedProviders: { ...s.failedProviders, [providerId]: reason } })),

      clearSendFailed: (providerId) =>
        set((s) => {
          const fp = { ...s.failedProviders };
          delete fp[providerId];
          return { failedProviders: fp };
        }),

      // Handle complete AI response
      handleAiResponse: (data) => {
        const { providerId, content } = data;
        set((s) => {
          // Update responses map
          const responses = { ...s.responses, [providerId]: content };
          // Clear partial response
          const partialResponses = { ...s.partialResponses };
          delete partialResponses[providerId];
          // Update responding status
          const respondingStatus = { ...s.respondingStatus, [providerId]: false };

          // If in group mode, add AI message to the active group
          let groups = s.groups;
          if (s.mode === 'group' && s.activeGroupId) {
            groups = s.groups.map((g) => {
              if (g.id === s.activeGroupId) {
                // Check if this AI already responded recently (avoid duplicates)
                const member = g.members.find((m) => m.providerId === providerId);
                if (member) {
                  const aiMsg: ChatMessage = {
                    id: `ai_${providerId}_${Date.now()}`,
                    role: 'ai',
                    sender: providerId,
                    senderName: member.nickname,
                    content,
                    timestamp: Date.now(),
                    providerId,
                  };
                  return { ...g, messages: [...g.messages, aiMsg], updatedAt: Date.now() };
                }
              }
              return g;
            });
          }

          return { responses, partialResponses, respondingStatus, groups };
        });
      },

      // Handle partial/streaming AI response
      handleAiPartialResponse: (data) => {
        const { providerId, content } = data;
        set((s) => ({
          partialResponses: { ...s.partialResponses, [providerId]: content },
        }));
      },
    }),
    {
      name: 'multichat-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields — volatile runtime state (responding, partial, etc.) is NOT persisted
      partialize: (state) => ({
        mode: state.mode,
        enabledProviders: state.enabledProviders,
        syncMessages: state.syncMessages,
        groups: state.groups,
        activeGroupId: state.activeGroupId,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        activeProviderTab: state.activeProviderTab,
      }),
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('[MultiChat] Persist rehydration error:', error);
          }
          _hydrated = true;
          hydrationListeners.forEach((cb) => cb());
          hydrationListeners.length = 0;
        };
      },
    }
  )
);
