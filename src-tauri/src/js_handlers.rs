/// JavaScript injection handlers for each AI platform.
/// Each function returns a JS string that will be eval'd in the webview.

/// Bridge v4: Platform-aware response capture + off-screen safe visibility checks
/// v3→v4 changes:
/// - findLastAiMessage now tries platform-specific selectors first
/// - Each platform has tailored message content extraction
/// - Improved responding→idle transition detection
/// - Better login detection per platform
pub fn bridge_script(provider_id: &str) -> String {
    // Platform-specific selectors for finding AI messages
    let ai_msg_selectors = match provider_id {
        "deepseek" => r#"[class*="ds-chat-message--assistant"],[class*="message"][class*="assistant"],[class*="ds-markdown--block"]"#,
        "kimi" => r#"[class*="message"][class*="assistant"],[class*="msg-item"][class*="bot"],[class*="assistant-msg"],.markdown-body"#,
        "chatglm" => r#"[class*="message"][class*="assistant"],[class*="chat-item"]:not([class*="user"]),[class*="markdown-body"]"#,
        "qianwen" => r#"[class*="message"][class*="assistant"],[class*="chat-msg"]:not([class*="user"]),[class*="bot-msg"],.markdown-body,[class*="answer"]"#,
        "doubao" => r#"[class*="message"][class*="assistant"],[class*="chat-item"]:not([class*="user"]),[class*="bot-msg"],[class*="answer-content"]"#,
        "yuanbao" => r#"[class*="message"][class*="assistant"],[class*="chat-msg"]:not([class*="user"]),[class*="bot"],[class*="answer"]"#,
        "minimax" => r#"[class*="message"][class*="assistant"],[class*="chat-item"]:not([class*="user"]),[class*="bot"]"#,
        "xinghuo" => r#"[class*="message"][class*="assistant"],[class*="chat-item"]:not([class*="user"]),[class*="bot-msg"]"#,
        "tiangong" => r#"[class*="message"][class*="assistant"],[class*="chat-item"]:not([class*="user"]),[class*="bot"],[class*="answer"]"#,
        "ima" => r#"[class*="message"][class*="assistant"],[class*="chat-msg"]:not([class*="user"]),[class*="bot"]"#,
        _ => r#"[class*="message"][class*="assistant"],[class*="message"][class*="bot"],[data-role="assistant"],[class*="markdown-body"]"#,
    };

    format!(r#"(function(){{
  if(window.__MC_BRIDGE__) return;
  window.__MC_BRIDGE__ = true;
  window.__MC_PID__ = '{}';
  window.__MC_LAST_RESPONSE__ = '';
  window.__MC_IS_RESPONDING__ = false;
  window.__MC_RESPONSE_SENT__ = '';
  window.__MC_HEARTBEAT_COUNT__ = 0;
  window.__MC_SEND_COUNT__ = 0;

  // Platform-specific AI message selectors
  var AI_MSG_SELECTORS = '{}';

  // ======== COMMUNICATION LAYER ========
  function mcSend(type, data) {{
    try {{
      var d = JSON.stringify(Object.assign({{ providerId: window.__MC_PID__ }}, data || {{}}));
      var encoded = encodeURIComponent(d);
      // Method A: Image trick (primary - lightweight)
      var img = new Image();
      img.src = 'mc://event/' + type + '/' + encoded;
      img.onload = img.onerror = function() {{ img.src = ''; img = null; }};
      setTimeout(function() {{ if(img) {{ img.src = ''; }} }}, 2000);
      // Method B: sendBeacon as backup (survives throttling)
      if(navigator.sendBeacon) {{ try {{ navigator.sendBeacon('mc://event/' + type + '/' + encoded, ''); }} catch(e){{}} }}
    }} catch(e) {{ console.error('[MC] send err:', e); }}
  }}

  // ======== KEEP-ALIVE HEARTBEAT ========
  function heartbeat() {{
    window.__MC_HEARTBEAT_COUNT__++;
    if (window.__MC_HEARTBEAT_COUNT__ % 10 === 0) {{
      mcSend('heartbeat', {{ count: window.__MC_HEARTBEAT_COUNT__, ts: Date.now(), url: location.href?.slice(0,40) }});
    }}
  }}

  // ======== LOGIN DETECTION ========
  function checkLogin() {{
    var f=!!(document.querySelector('textarea')||document.querySelector('[contenteditable="true"]')||document.querySelector('div[role="textbox"]'));
    var lp=!!(document.querySelector('[class*="login" i]')||document.querySelector('a[href*="login"]'));
    mcSend('login',{{loggedIn:f&&!lp}});
  }}

  // ======== RESPONSE CAPTURE (v4 - Platform-aware) ========
  function findLastAiMessage() {{
    var c=[];

    // Strategy A: Platform-specific selectors first (most reliable)
    try {{
      var ms=document.querySelectorAll(AI_MSG_SELECTORS);
      for(var i=0;i<ms.length;i++)c.push(ms[i]);
    }} catch(e) {{}}

    // Strategy B: Message containers with AI role indicators
    if(c.length===0) {{
      var ms2=document.querySelectorAll('[data-role="assistant"],[class*="msg"][class*="left"],[class*="chat-item"]:not([class*="user"])');
      for(var i=0;i<ms2.length;i++)c.push(ms2[i]);
    }}

    // Strategy C: Markdown blocks inside messages
    if(c.length===0) {{
      var md=document.querySelectorAll('.ds-markdown--block,.markdown-body,[class*="markdown"]');
      for(var i=0;i<md.length;i++){{
        var p=md[i].closest('[class*="message"],[class*="chat"]');
        if(p&&c.indexOf(p)===-1)c.push(p);
      }}
    }}

    // Strategy D: Generic content blocks (last resort)
    if(c.length===0) {{
      var a=document.querySelectorAll('article,[role="article"]');
      for(var i=0;i<a.length;i++)c.push(a[i]);
    }}

    if(c.length===0)return null;
    var last=c[c.length-1];
    var t=last?last.innerText||last.textContent:'';
    return t&&t.trim().length>0?t.trim():null;
  }}

  // ======== VISIBILITY CHECK (OFF-SCREEN SAFE) ========
  function isVisible(el) {{
    try {{
      if(!el) return false;
      var s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    }} catch(e) {{ return true; }}
  }}

  // ======== AI RESPONDING DETECTION (v4) ========
  function checkResponding() {{
    var r=false;var now=Date.now();

    // Strategy A: Stop/Cancel buttons
    var sb=document.querySelectorAll('button[class*="stop"],button[aria-label*="停止"],button[aria-label*="stop"],[class*="stop-btn"],button[class*="abort"]');
    for(var i=0;i<sb.length;i++){{
      if(isVisible(sb[i])){{r=true;break;}}
    }}

    // Strategy B: Loading/streaming indicators
    if(!r){{
      var ld=document.querySelectorAll('[class*="typing"],[class*="loading"],[class*="streaming"],[class*="thinking"],[class*="spinner"],[class*="cursor-blink"],[class*="generating"]');
      for(var i=0;i<ld.length;i++){{
        if(isVisible(ld[i])){{r=true;break;}}
      }}
    }}

    // Strategy C: Generate/regenerate buttons visible during generation
    if(!r){{
      var gen=document.querySelectorAll('[class*="generate"],[class*="regenerate"],[class*="abort"]');
      for(var i=0;i<gen.length;i++){{
        if(isVisible(gen[i])){{r=true;break;}}
      }}
    }}

    // Strategy D: Content growing after send (streaming detection)
    if(!r && window.__MC_SENT_AT__ && (now-window.__MC_SENT_AT__)<120000){{
      var text=findLastAiMessage();
      if(text && text.length>10 && text!==(window.__MC_PREV_TEXT__||'')){{
        r=true;
        window.__MC_PREV_TEXT__=text;
      }}
    }}

    // Strategy E: Content length increasing (alternative streaming detection)
    if(!r && window.__MC_SENT_AT__ && (now-window.__MC_SENT_AT__)<90000){{
      var text=findLastAiMessage();
      if(text && text.length>(window.__MC_CONTENT_LEN__||0)){{
        window.__MC_CONTENT_LEN__ = text.length;
        r=true;
      }}
    }}

    // IMPORTANT: If sent recently and no AI message detected yet, still consider responding
    // This prevents premature "idle" detection during model thinking phase
    if(!r && window.__MC_SENT_AT__ && (now-window.__MC_SENT_AT__)<30000){{
      var text=findLastAiMessage();
      if(!text || text.length < 5) {{
        // No AI response yet but within 30s of sending = likely still thinking
        r = true;
      }}
    }}

    var prev=window.__MC_IS_RESPONDING__;
    window.__MC_IS_RESPONDING__=r;

    // State transition detected → report immediately
    if(prev!==r){{
      console.log('[MC-v4] Status:',prev,'→',r,'for',window.__MC_PID__);
      mcSend('status',{{responding:r}});

      // AI finished → capture final response after DOM settles
      if(prev===true&&r===false){{
        // Use longer delay for DOM to fully settle
        setTimeout(function(){{
          var text=findLastAiMessage();
          if(text&&text.trim().length>0){{
            window.__MC_LAST_RESPONSE__=text.trim();
            if(window.__MC_LAST_RESPONSE__!==window.__MC_RESPONSE_SENT__){{
              window.__MC_RESPONSE_SENT__=window.__MC_LAST_RESPONSE__;
              console.log('[MC-v4] Response captured:',text.trim().length,'chars for',window.__MC_PID__);
              mcSend('response',{{content:text.trim()}});
            }}
          }} else {{
            // Fallback: try to capture any new content that appeared
            console.log('[MC-v4] No AI message found, retrying in 2s for',window.__MC_PID__);
            setTimeout(function(){{
              var text2=findLastAiMessage();
              if(text2&&text2.trim().length>0){{
                window.__MC_LAST_RESPONSE__=text2.trim();
                if(window.__MC_LAST_RESPONSE__!==window.__MC_RESPONSE_SENT__){{
                  window.__MC_RESPONSE_SENT__=window.__MC_LAST_RESPONSE__;
                  console.log('[MC-v4] Response captured (retry):',text2.trim().length,'chars');
                  mcSend('response',{{content:text2.trim()}});
                }}
              }}
            }},2000);
          }}
        }},1500);
      }}
    }}

    // While responding, send partial updates periodically
    if(r && window.__MC_HEARTBEAT_COUNT__%2===0){{
      var text=findLastAiMessage();
      if(text&&text.trim().length>5)mcSend('partial-response',{{content:text.trim()}});
    }}
  }}

  // ======== MUTATION OBSERVER (v4) ========
  var dt=null; var domObserver=null; window.__MC_CONNECTED__=false;

  function startObserving() {{
    var t=document.querySelector('main,[role="main"],[class*="chat"],[class*="conversation"],body');
    if(t){{
      if(domObserver)try{{domObserver.disconnect();}}catch(e){{}}
      domObserver=new MutationObserver(function(muts){{
        var rel=false;
        for(var i=0;i<muts.length;i++){{
          var m=muts[i];
          if(m.addedNodes&&m.addedNodes.length>0){{rel=true;break;}}
          if(m.type==='characterData'){{rel=true;break;}}
          if(m.target&&(m.target.innerText||'').length>(m.oldValue||'').length+20){{rel=true;break;}}
        }}
        if(!rel)return;if(dt)clearTimeout(dt);
        dt=setTimeout(function(){{checkResponding();}},500);
      }});
      domObserver.observe(t,{{childList:true,subtree:true,characterData:true}});
      window.__MC_CONNECTED__=true;
      console.log('[MC-v4] Observer started for',window.__MC_PID__);
    }} else {{ setTimeout(startObserving,1500); }}
  }}

  // ======== INITIALIZATION ========
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){{setTimeout(startObserving,800);}});
  else setTimeout(startObserving,800);

  setTimeout(checkLogin,2000);
  setInterval(checkLogin,45000);
  setInterval(checkResponding,2500);
  setInterval(heartbeat,3000);

  // SPA navigation → reconnect observer
  var _ps=history.pushState;history.pushState=function(){{_ps.apply(this,arguments);if(domObserver)try{{domObserver.disconnect();}}catch(e){{}}setTimeout(startObserving,1500);}};
  window.addEventListener('popstate',function(){{if(domObserver)try{{domObserver.disconnect();}}catch(e){{}}setTimeout(startObserving,1500);}});

  document.addEventListener('visibilitychange',function(){{if(!document.hidden){{checkResponding();mcSend('status',{{responding:window.__MC_IS_RESPONDING__}});}}}});

  setTimeout(function(){{checkResponding();}},3000);

  mcSend('bridge-ready',{{ts:Date.now()}});
  console.log('[MC] Bridge v4 ready for',window.__MC_PID__);
}})();
"#, provider_id, ai_msg_selectors)
}

/// Get the message-sending injection script for a specific provider
pub fn send_script(provider_id: &str, text: &str) -> String {
    let escaped = text.replace('\\', "\\\\").replace('`', "\\`").replace('$', "\\$");
    match provider_id {
        "deepseek" => format!(
            r#"(() => {{
  const t = document.querySelector('textarea._27c9245') || document.querySelector('textarea') || document.querySelector('div[role="textbox"]');
  if (!t) return {{ ok: false, reason: 'input-not-found' }};
  try {{
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (d?.set) d.set.call(t, `{escaped}`); else t.value = `{escaped}`;
    t.dispatchEvent(new Event('input', {{ bubbles: true }}));
  }} catch {{ t.value = `{escaped}`; }}
  setTimeout(() => {{
    t.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }}));
  }}, 200);
  return {{ ok: true }};
}})();"#,
        ),
        "kimi" => format!(
            r#"((function(){{
  // Kimi uses a special contenteditable div editor
  var t = document.querySelector('.chat-input-editor[contenteditable="true"]')
    || document.querySelector('[class*="editor"][contenteditable="true"]')
    || document.querySelector('[contenteditable="true"]');
  if(!t) return JSON.stringify({{ok:false,reason:'no-input'}});
  console.log('[MC-kimi] Found input:', t.tagName, (t.className||'').slice(0,50));

  // Focus the editor
  try {{ t.focus(); }} catch(e){{}}

  // For contenteditable: use execCommand to insert text properly
  // CRITICAL: Use execCommand('selectAll') — NOT selectNodeContents(t)
  // selectNodeContents selects raw DOM nodes including structural wrappers,
  // which corrupts rich editors like ProseMirror
  try {{
    // Clear existing content by selecting all and replacing
    document.execCommand('selectAll');
    // Now insertText will replace the selection
    document.execCommand('insertText', false, `{escaped}`);
  }} catch(e) {{
    // Fallback: set innerHTML with a text node
    t.innerHTML = '';
    var textNode = document.createTextNode(`{escaped}`);
    t.appendChild(textNode);
    t.dispatchEvent(new InputEvent('input', {{bubbles:true, inputType:'insertText', data:`{escaped}`}}));
  }}

  // Wait for React to process the input
  setTimeout(function(){{
    // Try to click the send button
    var sent = false;

    // Kimi's send button selectors (updated for new UI)
    var btnSelectors = [
      '.send-button-container:not(.disabled) .send-button',
      'button[class*="send"]:not([disabled])',
      '[class*="send-btn"]:not([disabled])',
      'button[aria-label*="发送"]:not([disabled])',
      'button[aria-label*="Send"]:not([disabled])'
    ];
    for(var i=0; i<btnSelectors.length && !sent; i++){{
      var btns = document.querySelectorAll(btnSelectors[i]);
      for(var j=0; j<btns.length; j++){{
        var s = window.getComputedStyle(btns[j]);
        if(s.display!=='none' && s.visibility!=='hidden' && !btns[j].disabled){{
          try{{ btns[j].click(); sent=true; console.log('[MC-kimi] clicked send'); }}catch(e2){{}}
          break;
        }}
      }}
    }}

    if(!sent){{
      // Fallback: Enter key
      console.log('[MC-kimi] Enter fallback');
      t.dispatchEvent(new KeyboardEvent('keydown', {{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
    }}
    window.__MC_SENT_AT__=Date.now();
    window.__MC_CONTENT_LEN__=0;
  }}, 300);

  return JSON.stringify({{ok:true}});
}}))()"#,
        ),
        "chatglm" => format!(
            r#"(() => {{
  const t = document.querySelector('textarea.scroll-display-none') || document.querySelector('textarea');
  if (!t) return {{ ok: false, reason: 'input-not-found' }};
  try {{
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (d?.set) d.set.call(t, `{escaped}`); else t.value = `{escaped}`;
    t.dispatchEvent(new Event('input', {{ bubbles: true }}));
  }} catch {{ t.value = `{escaped}`; }}
  setTimeout(() => {{
    const btn = document.querySelector('.enter.is-main-chat') || document.querySelector('.enter-icon-container');
    if (btn) {{ try {{ btn.click(); }} catch {{}} }}
    t.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }}));
  }}, 200);
  return {{ ok: true }};
}})();"#,
        ),
        "qianwen" => format!(
            r#"((function(){{
  // 通义千问 uses ProseMirror editor (contenteditable div)
  // CRITICAL: Do NOT use execCommand selectAll+delete — it corrupts ProseMirror state
  var textareas = Array.from(document.querySelectorAll('textarea'));
  var ceElements = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  console.log('[MC-qianwen] Debug: ', textareas.length, 'textareas,', ceElements.length, 'CEs');

  // Try ProseMirror first (千问's primary editor)
  var t = document.querySelector('.ProseMirror[contenteditable="true"]')
    || document.querySelector('[class*="ql-editor"][contenteditable="true"]')
    || document.querySelector('#chat-input')
    || document.querySelector('[data-testid="chat-input"]');

  // Fallback to any visible textarea
  if(!t && textareas.length>0){{
    var vis=textareas.filter(function(el){{var r=el.getBoundingClientRect();return r.width>100&&r.height>30;}});
    t=vis.length>0?vis[vis.length-1]:textareas[textareas.length-1];
  }}
  // Fallback to any contenteditable
  if(!t && ceElements.length>0) t=ceElements[0];

  if(!t) return JSON.stringify({{ok:false,reason:'no-input'}});
  console.log('[MC-qianwen] Found:', t.tagName, t.id||(t.className||'').slice(0,40));

  var isCE = t.tagName!=='TEXTAREA' && t.getAttribute('contenteditable')==='true';

  if(isCE){{
    // ProseMirror-safe text injection:
    // 1. Focus the editor
    t.focus();
    // 2. Use document.execCommand('selectAll') — this triggers ProseMirror's own
    //    selectAll handler properly (selects only text nodes, not structural wrappers)
    try {{ document.execCommand('selectAll'); }} catch(e){{}}
    // 3. insertText replaces the selection cleanly
    try {{
      document.execCommand('insertText', false, `{escaped}`);
    }} catch(e) {{
      t.textContent = `{escaped}`;
      t.dispatchEvent(new InputEvent('input',{{bubbles:true,data:`{escaped}`,inputType:'insertText'}}));
    }}
  }} else {{
    try{{
      var d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
      if(d&&d.set) d.set.call(t,`{escaped}`); else t.value=`{escaped}`;
    }}catch(e){{ t.value=`{escaped}`; }}
    t.dispatchEvent(new Event('input',{{bubbles:true}}));
    t.dispatchEvent(new Event('change',{{bubbles:true}}));
  }}

  setTimeout(function(){{
    var sent=false;
    var bts=['button[type="submit"]','.q-button.primary:not(:disabled)','button[class*="send"]:not(:disabled)',
      '[aria-label*="发送"]:not([disabled])','[aria-label*="Send"]:not([disabled])','[data-testid*="send"]'];
    for(var bi=0;bi<bts.length&&!sent;bi++){{
      var bs=document.querySelectorAll(bts[bi]);
      for(var bj=0;bj<bs.length;bj++){{
        var b=bs[bj];var s=window.getComputedStyle(b);
        if(s.display!=='none'&&s.visibility!=='hidden'&&!b.disabled){{
          try{{b.click();sent=true;console.log('[MC-qw] clicked:',bts[bi]);}}catch(e2){{}}
          break;
        }}
      }}
    }}
    if(!sent){{
      console.log('[MC-qw] Enter fallback');
      t.dispatchEvent(new KeyboardEvent('keydown',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
      t.dispatchEvent(new KeyboardEvent('keyup',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
    }}
    window.__MC_SENT_AT__=Date.now();
    window.__MC_CONTENT_LEN__=0;
  }},400);
  return JSON.stringify({{ok:true}});
}}))()"#,
        ),
        "doubao" => format!(
            r#"(() => {{
  const t = document.querySelector('textarea[data-testid="chat_input_input"]')
    || document.querySelector('[data-testid*="input" i] textarea')
    || document.querySelector('[class*="doubao"] textarea')
    || document.querySelector('[class*="volcengine"] textarea')
    || document.querySelector('textarea[placeholder*="输入" i]')
    || document.querySelector('textarea');
  if (!t) return {{ ok: false, reason: 'input-not-found' }};
  try {{
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (d?.set) d.set.call(t, `{escaped}`); else t.value = `{escaped}`;
    t.dispatchEvent(new Event('input', {{ bubbles: true }}));
    t.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }} catch {{ t.value = `{escaped}`; }}
  setTimeout(() => {{
    const btn = document.querySelector('button[data-testid="chat_input_send_button"]')
      || document.querySelector('[data-testid*="send" i]')
      || document.querySelector('button[class*="send" i][class*="btn" i]')
      || document.querySelector('[aria-label*="发送" i]');
    if (btn && !btn.disabled) {{ try {{ btn.click(); }} catch {{}} }}
    t.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }}));
    t.dispatchEvent(new KeyboardEvent('keyup', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }}));
  }}, 200);
  return {{ ok: true }};
}})();"#,
        ),
        "yuanbao" => format!(
            r#"(() => {{
  const t = document.querySelector('.ql-editor.ql-blank[contenteditable="true"]') || document.querySelector('[contenteditable="true"]');
  if (!t) return {{ ok: false, reason: 'input-not-found' }};
  try {{ t.focus(); }} catch {{}}
  try {{
    document.execCommand('selectAll');
    document.execCommand('insertText', false, `{escaped}`);
  }} catch {{}}
  try {{ t.dispatchEvent(new Event('input', {{ bubbles: true }})); }} catch {{}}
  setTimeout(() => {{
    t.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }}));
    const btn = document.querySelector('#yuanbao-send-btn');
    if (btn && !btn.classList.contains('disabled')) {{ try {{ btn.click(); }} catch {{}} }}
  }}, 200);
  return {{ ok: true }};
}})();"#,
        ),
        "minimax" => format!(
            r#"(() => {{
  const t = document.querySelector('textarea.scroll-display-none') || document.querySelector('textarea');
  if (!t) return {{ ok: false, reason: 'input-not-found' }};
  try {{
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (d?.set) d.set.call(t, `{escaped}`); else t.value = `{escaped}`;
    t.dispatchEvent(new Event('input', {{ bubbles: true }}));
  }} catch {{ t.value = `{escaped}`; }}
  setTimeout(() => {{
    const btn = document.querySelector('.enter.is-main-chat');
    if (btn) {{ try {{ btn.click(); }} catch {{}} }}
    t.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }}));
    const form = t.closest('form');
    if (form) {{ try {{ form.dispatchEvent(new Event('submit', {{ bubbles: true }})); }} catch {{}} }}
  }}, 200);
  return {{ ok: true }};
}})();"#,
        ),
        "xinghuo" => format!(
            r#"((function(){{
  var textareas = Array.from(document.querySelectorAll('textarea'));
  var ceElements = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  console.log('[MC-xinghuo] Debug: ', textareas.length, 'textareas,', ceElements.length, 'CEs');

  var selectors = ['#chatInput textarea','#chatInput [contenteditable="true"]','[class*="chat-input"] textarea',
    '[class*="xf-"] textarea','[class*="xinghuo"] textarea','[class*="spark"] textarea',
    '.xf-textarea textarea','textarea[placeholder*="输入"]','textarea[placeholder*="提问"]',
    '.ProseMirror[contenteditable="true"]'];
  var t=null;
  for(var si=0;si<selectors.length;si++){{t=document.querySelector(selectors[si]);if(t)break;}}
  if(!t&&textareas.length>0){{
    var vis=textareas.filter(function(el){{var r=el.getBoundingClientRect();return r.width>100&&r.height>30;}});
    t=vis.length>0?vis[vis.length-1]:textareas[textareas.length-1];
  }}
  if(!t&&ceElements.length>0)t=ceElements[ceElements.length-1];
  if(!t)t=document.querySelector('textarea')||document.querySelector('[contenteditable="true"]');
  if(!t)return JSON.stringify({{ok:false,reason:'no-input'}});

  var isCE=t.tagName!=='TEXTAREA'&&t.getAttribute('contenteditable')==='true';
  if(isCE){{
    t.focus();
    try {{
      document.execCommand('selectAll');
      document.execCommand('insertText', false, `{escaped}`);
    }} catch(e) {{
      t.textContent=`{escaped}`;
      t.dispatchEvent(new InputEvent('input',{{bubbles:true,data:`{escaped}`,inputType:'insertText'}}));
    }}
  }}else{{
    try{{var d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');if(d&&d.set)d.set.call(t,`{escaped}`);else t.value=`{escaped}`;}}catch(e){{t.value=`{escaped}`;}}
    t.dispatchEvent(new Event('input',{{bubbles:true}}));
    t.dispatchEvent(new Event('change',{{bubbles:true}}));
  }}

  setTimeout(function(){{
    var sent=false;
    var bts=['button[class*="send-btn"]:not(:disabled)','[class*="sendbtn"]:not(:disabled)',
      '[aria-label*="发送"]:not([disabled])','[aria-label*="Send"]:not([disabled])',
      'button[class*="send"]:not(:disabled)'];
    for(var bi=0;bi<bts.length&&!sent;bi++){{
      var bs=document.querySelectorAll(bts[bi]);
      for(var bj=0;bj<bs.length;bj++){{
        var b=bs[bj];var s=window.getComputedStyle(b);
        if(s.display!=='none'&&s.visibility!=='hidden'&&!b.disabled){{
          try{{b.click();sent=true;console.log('[MC-xh] clicked:',bts[bi]);}}catch(e2){{}}
          break;
        }}
      }}
    }}
    if(!sent){{
      t.dispatchEvent(new KeyboardEvent('keydown',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
      t.dispatchEvent(new KeyboardEvent('keyup',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
    }}
    window.__MC_SENT_AT__=Date.now();
    window.__MC_CONTENT_LEN__=0;
  }},500);
  return JSON.stringify({{ok:true}});
}}))()"#,
        ),
        "tiangong" => format!(
            r#"((function(){{
  var textareas = Array.from(document.querySelectorAll('textarea'));
  var ceElements = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  console.log('[MC-tiangong] Debug: ', textareas.length, 'textareas,', ceElements.length, 'CEs');

  var selectors = [
    'textarea[placeholder*="输入"]','textarea[placeholder*="提问"]',
    '[class*="tiangong"] textarea','[class*="tg-"] textarea',
    '.ProseMirror[contenteditable]','[class*="chat-input"] textarea',
    '[class*="input-area"] textarea','[class*="input-area"] [contenteditable="true"]'
  ];
  var t=null;
  for(var si=0;si<selectors.length;si++){{t=document.querySelector(selectors[si]);if(t)break;}}
  if(!t&&textareas.length>0)t=textareas[textareas.length-1];
  if(!t&&ceElements.length>0)t=ceElements[ceElements.length-1];
  if(!t)return JSON.stringify({{ok:false,reason:'no-input'}});
  console.log('[MC-tiangong] Found:',t.tagName,(t.className||'').slice(0,40));

  var isCE=t.tagName!=='TEXTAREA'&&t.getAttribute('contenteditable')==='true';
  if(isCE){{
    t.focus();
    try {{
      document.execCommand('selectAll');
      document.execCommand('insertText', false, `{escaped}`);
    }} catch(e) {{
      t.textContent=`{escaped}`;
      t.dispatchEvent(new InputEvent('input',{{bubbles:true}}));
    }}
  }}else{{
    try{{var d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');if(d&&d.set)d.set.call(t,`{escaped}`);else t.value=`{escaped}`;}}catch(e){{t.value=`{escaped}`;}}
    t.dispatchEvent(new Event('input',{{bubbles:true}}));
  }}

  setTimeout(function(){{
    var sent=false;
    // More comprehensive send button selectors for 天工
    var bts=[
      'button[class*="send"]:not(:disabled)',
      'button[type="submit"]:not(:disabled)',
      '[aria-label*="发送"]:not([disabled])',
      '[aria-label*="Send"]:not([disabled])',
      '[class*="submit-btn"]:not(:disabled)',
      'button[class*="confirm"]:not(:disabled)',
      // 天工 may use an icon button inside a form
      'form button:last-of-type:not(:disabled)',
      '[class*="action"] button:not(:disabled)'
    ];
    for(var bi=0;bi<bts.length&&!sent;bi++){{
      var bs=document.querySelectorAll(bts[bi]);
      for(var bj=0;bj<bs.length;bj++){{
        var b=bs[bj];var s=window.getComputedStyle(b);
        if(s.display!=='none'&&s.visibility!=='hidden'&&!b.disabled){{
          try{{b.click();sent=true;console.log('[MC-tg] clicked send btn:',bts[bi]);}}catch(e2){{}}
          break;
        }}
      }}
    }}
    if(!sent){{
      console.log('[MC-tg] Enter fallback');
      t.dispatchEvent(new KeyboardEvent('keydown',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
      t.dispatchEvent(new KeyboardEvent('keyup',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
      // Also try submitting the form
      var form = t.closest('form');
      if(form){{ try{{form.dispatchEvent(new Event('submit',{{bubbles:true}}));}}catch(e3){{}} }}
    }}
    window.__MC_SENT_AT__=Date.now();
    window.__MC_CONTENT_LEN__=0;
  }},500);
  return JSON.stringify({{ok:true}});
}}))()"#,
        ),
        // IMA handler
        "ima" => format!(
            r#"((function(){{
  var textareas = Array.from(document.querySelectorAll('textarea'));
  var ceElements = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  console.log('[MC-ima] Debug: ', textareas.length, 'textareas,', ceElements.length, 'CEs');

  var selectors = ['textarea[placeholder*="输入"]','textarea[placeholder*="提问"]',
    '[class*="ima"] textarea','[class*="chat"] textarea','.ql-editor[contenteditable]',
    '[class*="input"] textarea','textarea[data-state="active"]'];
  var t=null;
  for(var si=0;si<selectors.length;si++){{t=document.querySelector(selectors[si]);if(t)break;}}
  if(!t&&textareas.length>0){{
    var vis=textareas.filter(function(el){{var r=el.getBoundingClientRect();return r.width>80&&r.height>20;}});
    t=vis.length>0?vis[vis.length-1]:textareas[textareas.length-1];
  }}
  if(!t&&ceElements.length>0)t=ceElements[ceElements.length-1];
  if(!t)return JSON.stringify({{ok:false,reason:'no-input'}});

  var isCE=t.tagName!=='TEXTAREA'&&t.getAttribute('contenteditable')==='true';
  if(isCE){{
    t.focus();
    try {{
      document.execCommand('selectAll');
      document.execCommand('insertText', false, `{escaped}`);
    }} catch(e) {{
      t.textContent=`{escaped}`;
      t.dispatchEvent(new InputEvent('input',{{bubbles:true,data:`{escaped}`,inputType:'insertText'}}));
    }}
    t.dispatchEvent(new Event('input',{{bubbles:true}}));
  }}else{{
    try{{var d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');if(d&&d.set)d.set.call(t,`{escaped}`);else t.value=`{escaped}`;}}catch(e){{t.value=`{escaped}`;}}
    t.dispatchEvent(new Event('input',{{bubbles:true}}));
    t.dispatchEvent(new Event('change',{{bubbles:true}}));
  }}

  setTimeout(function(){{
    var sent=false;
    var bts=['button[type="submit"]','button[class*="send"]','[aria-label*="发送"]',
      '[aria-label*="Send"]','button[class*="icon"]:last-of-type',
      '[class*="toolbar"] button:last-child','svg[class*="send"]'];
    for(var bi=0;bi<bts.length&&!sent;bi++){{
      var bs=document.querySelectorAll(bts[bi]);
      for(var bj=0;bj<bs.length;bj++){{
        var b=bs[bj];var s=window.getComputedStyle(b);
        if(s.display!=='none'&&s.visibility!=='hidden'&&!b.disabled){{
          try{{b.click();sent=true;console.log('[MC-ima] clicked:',bts[bi]);}}catch(e2){{}}
          break;
        }}
      }}
    }}
    if(!sent){{
      var form = t.closest('form');
      if(form){{try{{form.dispatchEvent(new Event('submit',{{bubbles:true}}));}}catch(e3){{}}}}
    }}
    }}
    if(!sent){{
      t.dispatchEvent(new KeyboardEvent('keydown',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
      t.dispatchEvent(new KeyboardEvent('keyup',{{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}}));
    }}
    window.__MC_SENT_AT__=Date.now();
    window.__MC_CONTENT_LEN__=0;
  }},500);
  return JSON.stringify({{ok:true}});
}}))()"#,
        ),
        // Generic handler for remaining providers (xiaomi, iflow, longcat, etc.)
        _ => format!(
            r#"(() => {{
  const t = document.querySelector('textarea')
    || document.querySelector('[contenteditable="true"]')
    || document.querySelector('div[role="textbox"]')
    || document.querySelector('[class*="editor" i]')
    || document.querySelector('[class*="input" i]');
  if (!t) return {{ ok: false, reason: 'input-not-found' }};
  const text = `{escaped}`;
  if (t.tagName?.toLowerCase() !== 'textarea' && t.getAttribute('contenteditable') === 'true') {{
    try {{ t.focus(); }} catch {{}}
    try {{
      document.execCommand('selectAll');
      document.execCommand('insertText', false, text);
    }} catch {{}}
    try {{ t.dispatchEvent(new Event('input', {{ bubbles: true }})); }} catch {{}}
  }} else {{
    try {{
      const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if (d?.set) d.set.call(t, text); else t.value = text;
      t.dispatchEvent(new Event('input', {{ bubbles: true }}));
    }} catch {{ t.value = text; }}
  }}
  setTimeout(() => {{
    const btn = document.querySelector('button[type="submit"]')
      || document.querySelector('button[aria-label*="发送" i]')
      || document.querySelector('button[aria-label*="Send" i]')
      || document.querySelector('[class*="send" i][class*="btn" i]');
    if (btn && !btn.disabled) {{ try {{ btn.click(); }} catch {{}} }}
    else {{
      try {{ t.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }})); }} catch {{}}
    }}
    window.__MC_SENT_AT__=Date.now();
    window.__MC_CONTENT_LEN__=0;
  }}, 200);
  return {{ ok: true }};
}})();"#,
        ),
    }
}
