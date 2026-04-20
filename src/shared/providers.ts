import type { AiProvider } from './types';

// Provider catalog - kept in sync with Rust src-tauri/src/providers.rs
export const PROVIDER_CATALOG: AiProvider[] = [
  { id: 'deepseek',  name: 'DeepSeek',  url: 'https://chat.deepseek.com/',                        icon: '🔮', color: '#4D6BFE', category: 'cn' },
  { id: 'kimi',      name: 'Kimi',      url: 'https://kimi.moonshot.cn/',                       icon: '🌙', color: '#000000', category: 'cn' },
  { id: 'chatglm',   name: '智谱清言',   url: 'https://chatglm.cn/',                            icon: '💬', color: '#3E6BEC', category: 'cn' },
  { id: 'qianwen',   name: '通义千问',   url: 'https://www.qianwen.com/',                        icon: '☁️', color: '#6236FF', category: 'cn' },
  { id: 'doubao',    name: '豆包',      url: 'https://www.doubao.com/chat/',                    icon: '🫘', color: '#3370FF', category: 'cn' },
  { id: 'yuanbao',   name: '腾讯元宝',   url: 'https://yuanbao.tencent.com/chat/naQivTmsDa',     icon: '💰', color: '#0052D9', category: 'cn' },
  { id: 'minimax',   name: 'MiniMax',   url: 'https://agent.minimaxi.com/',                     icon: '🤖', color: '#1C1C1E', category: 'cn' },
  { id: 'xinghuo',   name: '讯飞星火',   url: 'https://xinghuo.xfyun.cn/desk',                  icon: '⭐', color: '#1A6DFF', category: 'cn' },
  { id: 'tiangong',  name: '天工AI',     url: 'https://www.tiangong.cn/',                        icon: '🏗️', color: '#FF4D4F', category: 'cn' },
  { id: 'iflow',     name: 'iFlow',     url: 'https://iflow.cn/',                              icon: '🌊', color: '#6366F1', category: 'cn' },
  { id: 'longcat',   name: 'LongCat',   url: 'https://longcat.chat/',                          icon: '🐱', color: '#FF6B35', category: 'cn' },
  { id: 'ima',       name: '腾讯IMA',   url: 'https://ima.qq.com/',                            icon: '📮', color: '#12B7F5', category: 'cn' },
  { id: 'xiaomi',    name: '小米Mimo',   url: 'https://aistudio.xiaomimimo.com/#/c',            icon: '📱', color: '#FF6900', category: 'cn' },
];

export const DEFAULT_ENABLED = ['deepseek', 'kimi', 'chatglm', 'qianwen', 'doubao'];
