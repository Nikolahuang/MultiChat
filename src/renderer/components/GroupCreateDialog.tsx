import React, { useState } from 'react';
import { X, Plus, Users, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { PROVIDER_CATALOG } from '../../shared/providers';
import { genId } from '../lib/utils';
import type { ChatGroup, GroupMember } from '../../shared/types';

export default function GroupCreateDialog() {
  const show = useAppStore((s) => s.showGroupCreateDialog);
  const setShow = useAppStore((s) => s.setShowGroupCreateDialog);
  const addGroup = useAppStore((s) => s.addGroup);
  const loginStatus = useAppStore((s) => s.loginStatus);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState('');

  const handleClose = () => {
    setShow(false);
    setName('');
    setDescription('');
    setSelectedIds([]);
    setNicknames({});
    setRoles({});
    setSearchText('');
  };

  const toggleProvider = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed || selectedIds.length === 0) return;

    const members: GroupMember[] = selectedIds.map((id) => ({
      providerId: id,
      nickname: nicknames[id]?.trim() || PROVIDER_CATALOG.find((p) => p.id === id)?.name || id,
      role: roles[id]?.trim() || undefined,
    }));

    const group: ChatGroup = {
      id: genId('group'),
      name: trimmed,
      description: description.trim() || undefined,
      members,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addGroup(group);
    handleClose();
  };

  if (!show) return null;

  const filteredProviders = PROVIDER_CATALOG.filter((p) =>
    p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    p.id.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-[480px] max-h-[85vh] bg-[#14141e] rounded-2xl border border-white/[0.06] shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#6366F1]/15 flex items-center justify-center">
              <Users size={14} className="text-[#6366F1]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white/90">新建群聊</h3>
              <p className="text-[10px] text-white/30">邀请 AI 成员加入对话</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors duration-200"
          >
            <X size={14} className="text-white/30" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Group name */}
          <div>
            <label className="block text-[11px] text-white/40 mb-1.5 uppercase tracking-wider">群聊名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：AI 顾问团、创意头脑风暴..."
              className="w-full bg-[#0d0d15] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/15 outline-none focus:border-[#6366F1]/30 transition-colors duration-200"
              autoFocus
            />
          </div>

          {/* Group description / goal */}
          <div>
            <label className="block text-[11px] text-white/40 mb-1.5 uppercase tracking-wider">
              群聊目标介绍
              <span className="text-white/20 normal-case ml-1 font-normal">(可选)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={"描述这个群的对话目标和背景，让每个 AI 成员明白自己的角色定位。\n例如：\"我们正在讨论一个新产品的功能设计，请从不同角度给出建议\""}
              rows={3}
              className="w-full bg-[#0d0d15] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/15 outline-none focus:border-[#6366F1]/30 transition-colors duration-200 resize-none leading-relaxed"
            />
            <p className="text-[9px] text-white/20 mt-1 flex items-center gap-1">
              <Sparkles size={9} />
              填写后发送消息时会自动附带此介绍，帮助 AI 理解上下文和角色定位
            </p>
          </div>

          {/* Search */}
          <div>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索 AI 平台..."
              className="w-full bg-[#0d0d15] border border-white/[0.06] rounded-lg px-3.5 py-2 text-[12px] text-white/80 placeholder:text-white/15 outline-none focus:border-[#6366F1]/30 transition-colors duration-200"
            />
          </div>

          {/* Member selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-white/40 uppercase tracking-wider">
                选择成员
              </label>
              {selectedIds.length > 0 && (
                <span className="text-[10px] text-[#6366F1]/60 flex items-center gap-1">
                  <Sparkles size={9} />
                  {selectedIds.length} 位已选
                </span>
              )}
            </div>
            <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
              {filteredProviders.map((p) => {
                const selected = selectedIds.includes(p.id);
                const loggedIn = loginStatus[p.id];
                return (
                  <div key={p.id}>
                    <button
                      onClick={() => toggleProvider(p.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors duration-200 text-left ${
                        selected ? 'bg-[#6366F1]/[0.04]' : ''
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all duration-200 ${
                          selected
                            ? 'bg-[#6366F1] border-[#6366F1]'
                            : 'border-white/15'
                        }`}
                      >
                        {selected && (
                          <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm">{p.icon}</span>
                      <span className="text-[12px] text-white/75 flex-1">{p.name}</span>
                      {loggedIn === true && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
                      )}
                    </button>

                    {/* Nickname + Role input when selected */}
                    {selected && (
                      <div className="pl-9 pr-3 pb-2 pt-0.5 space-y-1.5">
                        <input
                          type="text"
                          value={nicknames[p.id] || ''}
                          onChange={(e) =>
                            setNicknames((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={`代称（默认: ${p.name}）`}
                          className="w-full bg-[#0d0d15] border border-white/[0.04] rounded-md px-2.5 py-1.5 text-[11px] text-white/70 placeholder:text-white/15 outline-none focus:border-[#6366F1]/20 transition-colors duration-200"
                        />
                        <input
                          type="text"
                          value={roles[p.id] || ''}
                          onChange={(e) =>
                            setRoles((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={`角色定位（如："技术专家"、"创意顾问"...）`}
                          className="w-full bg-[#0d0d15] border border-white/[0.04] rounded-md px-2.5 py-1.5 text-[11px] text-[#6366F1]/60 placeholder:text-white/10 outline-none focus:border-[#6366F1]/20 transition-colors duration-200"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-white/[0.04]">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-[12px] text-white/40 hover:text-white/60 rounded-lg hover:bg-white/5 transition-all duration-200"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || selectedIds.length === 0}
            className="flex items-center gap-1.5 px-5 py-2 text-[12px] text-white bg-[#6366F1] hover:bg-[#5558E6] disabled:bg-white/[0.04] disabled:text-white/15 disabled:cursor-not-allowed rounded-lg transition-all duration-200 shadow-lg shadow-[#6366F1]/20 disabled:shadow-none"
          >
            <Plus size={12} />
            创建群聊
          </button>
        </div>
      </div>
    </div>
  );
}
