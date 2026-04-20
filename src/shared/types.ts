// ============ AI 平台类型 ============
export interface AiProvider {
  id: string;
  name: string;
  url: string;
  icon: string;       // emoji icon
  color: string;      // brand color
  category: 'cn' | 'global'; // 国内/国际
}

// ============ WebView 视图状态 ============
export interface ViewState {
  id: string;          // provider id
  isLoggedIn: boolean;
  isResponding: boolean;
  lastResponse?: string;
  lastError?: string;
}

// ============ 消息类型 ============
export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  sender: string;      // AI provider id or 'user'
  senderName: string;  // 显示名称（群聊中的昵称）
  content: string;
  timestamp: number;
  providerId?: string;
}

// ============ 群聊类型 ============
export interface GroupMember {
  providerId: string;
  nickname: string;    // 用户设置的代称
  role?: string;       // 角色定位（如："技术专家"、"创意顾问"、"批判者"）
}

export interface ChatGroup {
  id: string;
  name: string;
  description?: string;  // 群聊目标介绍（让每个AI明白自己的角色定位）
  members: GroupMember[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ============ 同步模式 ============
export interface SyncSession {
  messages: ChatMessage[];
  responses: Record<string, string>;  // providerId -> latest response
}

// ============ IPC 通信类型 ============
export interface IpcApi {
  // 视图管理
  'multicat/views/create': (id: string) => Promise<void>;
  'multicat/views/remove': (id: string) => Promise<void>;
  'multicat/views/check-login': (id: string) => Promise<boolean>;
  'multicat/views/check-status': (id: string) => Promise<boolean>;
  'multicat/views/get-response': (id: string) => Promise<string>;
  'multicat/views/resize': (bounds: { x: number; y: number; width: number; height: number; ids: string[] }) => Promise<void>;
  'multicat/views/show': (ids: string[]) => Promise<void>;
  'multicat/views/hide': (ids: string[]) => Promise<void>;

  // 消息发送
  'multicat/broadcast': (payload: { text: string; targets: string[] }) => Promise<Record<string, { ok: boolean; reason?: string }>>;

  // 存储
  'multicat/store/get': (key: string) => Promise<any>;
  'multicat/store/set': (payload: { key: string; value: any }) => Promise<void>;

  // 窗口
  'multicat/window/minimize': () => void;
  'multicat/window/maximize': () => void;
  'multicat/window/close': () => void;
}

export interface IpcEvents {
  'multicat/login-changed': (payload: { id: string; loggedIn: boolean }) => void;
  'multicat/status-changed': (payload: { id: string; responding: boolean }) => void;
  'multicat/views-ready': (payload: { ids: string[] }) => void;
  'multicat/message-sending': (payload: { targets: string[] }) => void;
  'multicat/message-success': (payload: { results: Record<string, { ok: boolean }> }) => void;
  'multicat/window-state': (payload: { maximized: boolean }) => void;
}

// ============ Store Schema ============
export interface StoreSchema {
  aiProviders: AiProvider[];
  enabledProviders: string[];
  groups: ChatGroup[];
  activeGroupId?: string;
  layout: { mode: 'sync' | 'group'; groupOrder?: string[] };
  theme: 'light' | 'dark';
  sessions?: Array<{ id: string; title: string; createdAt: string; aiStates: Record<string, { url: string }> }>;
}
