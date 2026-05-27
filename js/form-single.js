// Modo "Conteúdo Único": campos condicionais, tags de palavra-chave,
// persistência em localStorage, validação e envio com loading.

const FormSingle = (() => {
  const LS_KEY = 'gc_single_form';
  let keywords = [];
  let lastResult = null; // { content, title }

  // refs preenchidas no init
  let els = {};

  function init() {
    els = {
      form: document.getElementById('form-single'),
      type: document.getElementById('s-type'),
      theme: document.getElementById('s-theme'),
      themeErr: document.getElementById('s-theme-err'),
      submit: document.getElementById('s-submit'),
      clear: document.getElementById('s-clear'),
      kwBox: document.getElementById('s-keywords-box'),
      kwInput: document.getElementById('s-keywords-input'),
      kwHidden: document.getElementById('s-keywords'),
      resultWrap: document.getElementById('single-result'),
      resultContent: document.getElementById('single-result-content'),
      resultMeta: document.getElementById('r-meta'),
      resultSummary: document.getElementById('r-summary'),
      resultTags: document.getElementById('r-tags'),
      copy: document.getElementById('r-copy'),
      copyHtml: document.getElementById('r-copy-html'),
      download: document.getElementById('r-download'),
      again: document.getElementById('r-again'),
      // campos condicionais (containers)
      condPlatform: document.querySelector('[data-field="platform"]'),
      condSubject: document.querySelector('[data-field="subject"]')
    };

    if (!els.form) return;

    els.type.addEventListener('change', updateConditionalFields);
    els.form.addEventListener('submit', onSubmit);
    els.clear.addEventListener('click', clearForm);

    // tags
    els.kwBox.addEventListener('click', () => els.kwInput.focus());
    els.kwInput.addEventListener('keydown', onKeywordKey);
    els.kwInput.addEventListener('blur', () => commitKeyword(els.kwInput.value));

    // persistência: salva a cada mudança
    els.form.addEventListener('input', debounce(persist, 400));

    // ações do resultado
    els.copy.addEventListener('click', copyText);
    els.copyHtml.addEventListener('click', copyHtml);
    els.download.addEventListener('click', downloadResult);
    els.again.addEventListener('click', resetToForm);

    restore();
    updateConditionalFields();
  }

  // ---------- Campos condicionais ----------
  function updateConditionalFields() {
    const t = els.type.value;
    toggle(els.condPlatform, t === 'social');
    toggle(els.condSubject, t === 'email');
  }
  function toggle(el, show) {
    if (!el) return;
    el.classList.toggle('hidden', !show);
  }

  // ---------- Palavras-chave (tags) ----------
  function onKeywordKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitKeyword(els.kwInput.value);
      els.kwInput.value = '';
    } else if (e.key === 'Backspace' && els.kwInput.value === '' && keywords.length) {
      keywords.pop();
      renderKeywords();
    }
  }
  function commitKeyword(raw) {
    raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((k) => {
      if (!keywords.includes(k)) keywords.push(k);
    });
    els.kwInput.value = '';
    renderKeywords();
  }
  function removeKeyword(k) {
    keywords = keywords.filter((x) => x !== k);
    renderKeywords();
  }
  function renderKeywords() {
    // remove tags existentes (mantém o input)
    els.kwBox.querySelectorAll('.kw-tag').forEach((n) => n.remove());
    keywords.forEach((k) => {
      const tag = document.createElement('span');
      tag.className = 'kw-tag';
      const label = document.createElement('span');
      label.textContent = k;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', `Remover ${k}`);
      btn.textContent = '×';
      btn.addEventListener('click', (e) => { e.stopPropagation(); removeKeyword(k); });
      tag.append(label, btn);
      els.kwBox.insertBefore(tag, els.kwInput);
    });
    els.kwHidden.value = keywords.join(', ');
    persist();
  }

  // ---------- Coleta / validação ----------
  function collect() {
    const fd = new FormData(els.form);
    const data = Object.fromEntries(fd.entries());
    data.keywords = keywords.slice();
    return data;
  }

  // Mapeamentos front -> schema esperado pelo n8n.
  const TYPE_MAP = { blog: 'blog_post', social: 'social_post', email: 'email_marketing' };
  const LENGTH_MAP = { curto: 'short', medio: 'medium', longo: 'long' };

  function uuid() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // fallback simples
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Monta o payload no formato que o webhook espera (mode/contentType/params/meta).
  function buildPayload(flat) {
    const params = {
      suggestedTitle: flat.title || '',
      theme: flat.theme || '',
      tone: flat.tone || '',
      targetAudience: flat.audience || '',
      keywords: Array.isArray(flat.keywords) ? flat.keywords : [],
      length: LENGTH_MAP[flat.length] || 'medium',
      language: flat.language || 'pt-BR',
      extraInstructions: flat.extra || ''
    };
    // campos específicos por tipo
    if (flat.type === 'social' && flat.platform) params.platform = flat.platform;
    if (flat.type === 'email' && flat.subject) params.subject = flat.subject;

    return {
      mode: 'single',
      contentType: TYPE_MAP[flat.type] || 'blog_post',
      params,
      meta: {
        requestId: uuid(),
        timestamp: new Date().toISOString()
      }
    };
  }

  function validate() {
    let ok = true;
    if (!els.theme.value.trim()) {
      els.theme.classList.add('invalid');
      els.themeErr.classList.remove('hidden');
      els.theme.focus();
      ok = false;
    } else {
      els.theme.classList.remove('invalid');
      els.themeErr.classList.add('hidden');
    }
    return ok;
  }

  // ---------- Submit ----------
  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    // IMPORTANTE: coletar ANTES de desabilitar o form — campos disabled
    // não entram no FormData, o que zeraria o payload.
    const flat = collect();
    const payload = buildPayload(flat);

    setLoading(true);
    try {
      const res = await API.generateSingle(payload);
      lastResult = extractResult(res, flat);
      showResult(lastResult);
      UI.toast('Conteúdo gerado com sucesso!', 'success');
    } catch (err) {
      const msg = err instanceof API.ApiError ? err.message : 'Erro inesperado ao gerar o conteúdo.';
      UI.toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    const label = els.submit.querySelector('.btn-label');
    const spinner = els.submit.querySelector('.btn-spinner');
    els.submit.disabled = loading;
    label.classList.toggle('hidden', loading);
    spinner.classList.toggle('hidden', !loading);
    // desabilita o form inteiro durante o loading
    [...els.form.elements].forEach((el) => {
      if (el !== els.submit) el.disabled = loading;
    });
  }

  // ---------- Extração da resposta ----------
  // O webhook retorna o formato Responses API: o conteúdo real é uma string
  // JSON em output[0].content[0].text. Tratamos isso e também formatos simples.
  function extractResult(res, flat) {
    let raw = Array.isArray(res) ? res[0] : res;

    // localiza o texto bruto onde quer que esteja
    let innerText =
      raw?.output?.[0]?.content?.[0]?.text ??
      (typeof raw?.content === 'string' ? raw.content : null) ??
      raw?.text ??
      null;

    // parseia o JSON interno; se falhar, trata como markdown puro
    let data;
    if (innerText != null) {
      try { data = JSON.parse(innerText); }
      catch (_) { data = { body: innerText }; }
    } else if (raw && (raw.body || raw.title)) {
      data = raw; // a resposta já é o objeto de conteúdo
    } else {
      data = { body: '```json\n' + JSON.stringify(raw, null, 2) + '\n```' };
    }

    const title = data.title || flat.title || flat.theme || 'Conteúdo gerado';
    const markdown = data.body || data.content || data.text || '';
    const summary = data.summary || '';
    const tags = Array.isArray(data.suggestedTags) ? data.suggestedTags
               : Array.isArray(data.tags) ? data.tags : [];
    const metadata = data.metadata || {};

    const bodyHtml = renderMarkdown(markdown);
    const htmlFull = `<h1>${escapeHtml(title)}</h1>\n${bodyHtml}`;
    const plainText = `${title}\n\n${markdown}`.trim();

    return { title, markdown, summary, tags, metadata, bodyHtml, htmlFull, plainText };
  }

  // markdown -> HTML sanitizado
  function renderMarkdown(md) {
    let html;
    if (window.marked && typeof marked.parse === 'function') {
      html = marked.parse(md, { breaks: true, gfm: true });
    } else {
      html = '<p>' + escapeHtml(md).replace(/\n/g, '<br>') + '</p>';
    }
    return window.DOMPurify ? DOMPurify.sanitize(html) : html;
  }

  // ---------- Resultado ----------
  function showResult(r) {
    // título + corpo
    els.resultContent.innerHTML = r.htmlFull;

    // meta badges
    els.resultMeta.innerHTML = '';
    const badges = [];
    if (r.metadata.wordCount) badges.push(`${r.metadata.wordCount} palavras`);
    if (r.metadata.readingTimeMinutes) badges.push(`${r.metadata.readingTimeMinutes} min de leitura`);
    if (badges.length) {
      els.resultMeta.innerHTML = badges.map((b) => `<span class="meta-badge">${escapeHtml(b)}</span>`).join('');
      els.resultMeta.classList.remove('hidden');
    } else {
      els.resultMeta.classList.add('hidden');
    }

    // resumo
    if (r.summary) {
      els.resultSummary.textContent = r.summary;
      els.resultSummary.classList.remove('hidden');
    } else {
      els.resultSummary.classList.add('hidden');
    }

    // tags
    els.resultTags.innerHTML = '';
    if (r.tags.length) {
      els.resultTags.innerHTML = r.tags
        .map((t) => `<span class="result-tag">#${escapeHtml(String(t))}</span>`).join('');
      els.resultTags.classList.remove('hidden');
    } else {
      els.resultTags.classList.add('hidden');
    }

    els.resultWrap.classList.remove('hidden');
    els.resultWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function resetToForm() {
    els.resultWrap.classList.add('hidden');
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.theme.focus();
  }

  // Copiar texto (markdown legível)
  async function copyText() {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(lastResult.plainText);
      UI.toast('Texto copiado.', 'success');
    } catch (_) {
      UI.toast('Não foi possível copiar.', 'error');
    }
  }

  // Copiar como HTML rico (preserva negrito, listas, links ao colar em Docs/Gmail)
  async function copyHtml() {
    if (!lastResult) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([lastResult.htmlFull], { type: 'text/html' }),
          'text/plain': new Blob([lastResult.plainText], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
      } else {
        // fallback: copia o markup como texto
        await navigator.clipboard.writeText(lastResult.htmlFull);
      }
      UI.toast('HTML copiado (formatação preservada).', 'success');
    } catch (_) {
      UI.toast('Não foi possível copiar o HTML.', 'error');
    }
  }

  function downloadResult() {
    if (!lastResult) return;
    const safe = (lastResult.title || 'conteudo')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'conteudo';
    const blob = new Blob([lastResult.plainText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- Persistência ----------
  function persist() {
    try {
      const data = collect();
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (_) { /* localStorage indisponível: ignora */ }
  }
  function restore() {
    let data;
    try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) { return; }
    if (!data) return;
    // restaura campos simples
    [...els.form.elements].forEach((el) => {
      if (!el.name || el.type === 'submit') return;
      if (el.type === 'radio') {
        el.checked = (el.value === data[el.name]);
      } else if (el.name in data && el.name !== 'keywords') {
        el.value = data[el.name];
      }
    });
    keywords = Array.isArray(data.keywords) ? data.keywords.filter(Boolean) : [];
    renderKeywords();
  }
  function clearForm() {
    els.form.reset();
    keywords = [];
    renderKeywords();
    els.theme.classList.remove('invalid');
    els.themeErr.classList.add('hidden');
    els.resultWrap.classList.add('hidden');
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    updateConditionalFields();
    UI.toast('Formulário limpo.', 'info');
  }

  // ---------- util ----------
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  return { init };
})();
