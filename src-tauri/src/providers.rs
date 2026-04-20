/// AI platform provider definitions
pub struct Provider {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub icon: &'static str,
}

pub const PROVIDERS: &[Provider] = &[
    Provider { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/", icon: "🔮" },
    Provider { id: "kimi", name: "Kimi", url: "https://kimi.moonshot.cn/", icon: "🌙" },
    Provider { id: "chatglm", name: "智谱清言", url: "https://chatglm.cn/", icon: "💬" },
    Provider { id: "qianwen", name: "通义千问", url: "https://www.qianwen.com/", icon: "☁️" },
    Provider { id: "doubao", name: "豆包", url: "https://www.doubao.com/chat/", icon: "🫘" },
    Provider { id: "yuanbao", name: "腾讯元宝", url: "https://yuanbao.tencent.com/chat/naQivTmsDa", icon: "💰" },
    Provider { id: "minimax", name: "MiniMax", url: "https://agent.minimaxi.com/", icon: "🤖" },
    Provider { id: "xinghuo", name: "讯飞星火", url: "https://xinghuo.xfyun.cn/desk", icon: "⭐" },
    Provider { id: "tiangong", name: "天工AI", url: "https://www.tiangong.cn/", icon: "🏗️" },
    Provider { id: "iflow", name: "iFlow", url: "https://iflow.cn/", icon: "🌊" },
    Provider { id: "longcat", name: "LongCat", url: "https://longcat.chat/", icon: "🐱" },
    Provider { id: "ima", name: "腾讯IMA", url: "https://ima.qq.com/", icon: "📮" },
    Provider { id: "xiaomi", name: "小米Mimo", url: "https://aistudio.xiaomimimo.com/#/c", icon: "📱" },
];

pub fn get_provider(id: &str) -> Option<&'static Provider> {
    PROVIDERS.iter().find(|p| p.id == id)
}
