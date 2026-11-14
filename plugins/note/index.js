'use strict';

(function () {
  const { escapeHtml } = window.NoteonUtil;

  function renderMarkdown(src) {
    const blocks = [];
    let s = String(src || '');
    s = s.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      blocks.push(`<pre class="md-pre"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });

    const inline = (t) => escapeHtml(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

    const lines = s.split('\n');
    const out = [];
    let list = null;
    const closeList = () => {
      if (list) { out.push(`</${list}>`); list = null; }
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      const marker = line.trim().match(/^\u0000(\d+)\u0000$/);
      if (marker) {
        closeList();
        out.push(blocks[Number(marker[1])] || '');
        continue;
      }
      if (!line.trim()) { closeList(); continue; }

      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        closeList();
        const lv = m[1].length;
        out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
      } else if (/^(---|\*\*\*|___)\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
      } else if ((m = line.match(/^>\s?(.*)$/))) {
        closeList();
        out.push(`<blockquote>${inline(m[1])}</blockquote>`);
      } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        const task = m[1].match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
          out.push(`<li class="task"><span class="cb ${task[1].toLowerCase() === 'x' ? 'on' : ''}"></span>${inline(task[2])}</li>`);
        } else {
          out.push(`<li>${inline(m[1])}</li>`);
        }
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else {
        closeList();
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    closeList();
    return out.join('');
  }

  window.Noteon.define({
    id: 'note',
    mount(ctx) {
      const { root, api, util } = ctx;
      const st = api.state || {};
      let text = typeof st.text === 'string' ? st.text : '';
      let fontSize = Number(st.fontSize) || 14;
      let preview = !!st.preview;

      root.innerHTML = `
        <div class="note-wrap">
          <textarea class="note-input" spellcheck="false" placeholder="写点什么…&#10;&#10;支持 Markdown：标题、列表、**粗体**、\`代码\`、[链接]()"></textarea>
          <div class="note-md hidden"></div>
        </div>
        <div class="note-bar">
          <span class="note-count"></span>
          <span class="note-spacer"></span>
          <button class="note-mini" data-act="preview" title="Markdown 预览">预览</button>
          <button class="note-mini" data-act="font" data-dir="-1" title="字号减小">A−</button>
          <button class="note-mini" data-act="font" data-dir="1" title="字号增大">A+</button>
        </div>`;

      const ta = root.querySelector('.note-input');
      const md = root.querySelector('.note-md');
      const count = root.querySelector('.note-count');
      const btnPreview = root.querySelector('[data-act="preview"]');

      ta.value = text;
      ta.style.fontSize = fontSize + 'px';
      md.style.fontSize = fontSize + 'px';

      const updateCount = () => {
        const chars = ta.value.length;
        const lines = ta.value ? ta.value.split('\n').length : 0;
        count.textContent = `${chars} 字 · ${lines} 行`;
      };

      const render = () => {
        md.innerHTML = renderMarkdown(ta.value);
        if (!ta.value.trim()) {
          md.innerHTML = `<div class="empty" style="padding:40px 12px">${chipEmpty()}</div>`;
        }
      };

      const chipEmpty = () => '还没有内容，切回编辑写点什么吧。';

      const setPreview = (on) => {
        preview = on;
        ta.classList.toggle('hidden', on);
        md.classList.toggle('hidden', !on);
        btnPreview.classList.toggle('on', on);
        btnPreview.textContent = on ? '编辑' : '预览';
        if (on) render();
        save();
      };

      let timer = 0;
      const save = () => {
        clearTimeout(timer);
        timer = setTimeout(() => api.saveState({ text: ta.value, fontSize, preview }), 320);
      };

      ta.addEventListener('input', () => {
        updateCount();
        if (preview) render();
        save();
      });

      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          api.saveState({ text: ta.value, fontSize, preview });
          api.toast('已保存');
        }
      });

      btnPreview.addEventListener('click', () => setPreview(!preview));
      root.querySelectorAll('[data-act="font"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          fontSize = Math.max(11, Math.min(30, fontSize + Number(btn.dataset.dir)));
          ta.style.fontSize = fontSize + 'px';
          md.style.fontSize = fontSize + 'px';
          api.toast('字号 ' + fontSize + 'px');
          save();
        });
      });

      md.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a && a.href) {
          e.preventDefault();
          api.openUrl(a.href);
        }
      });

      updateCount();
      if (preview) setPreview(true);
      setTimeout(() => { if (!preview) ta.focus(); }, 80);

      return {
        unmount() {
          clearTimeout(timer);
          api.saveState({ text: ta.value, fontSize, preview });
        },
      };
    },
  });
})();
