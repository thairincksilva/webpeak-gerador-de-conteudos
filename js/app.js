// Orquestrador: utilitário de toast (compartilhado), roteamento entre tabs e
// inicialização dos módulos.

// ---------- UI: toasts (global, usado pelos módulos) ----------
const UI = (() => {
  const container = () => document.getElementById('toast-container');
  const ICONS = {
    success: 'M4.5 12.75l6 6 9-13.5',
    error: 'M6 18L18 6M6 6l12 12',
    info: 'M11.25 11.25h1.5v5.25m-1.5 0h3M12 7.5h.008v.008H12V7.5z'
  };

  function toast(message, type = 'info', timeout = 4000) {
    const c = container();
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="${ICONS[type] || ICONS.info}" />
      </svg>
      <span class="flex-1">${escapeHtml(message)}</span>`;
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const remove = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    };
    const t = setTimeout(remove, timeout);
    el.addEventListener('click', () => { clearTimeout(t); remove(); });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { toast };
})();

// ---------- Roteamento de tabs ----------
const Tabs = (() => {
  const LS_KEY = 'gc_active_tab';
  let buttons = [];
  let panels = {};

  function init() {
    buttons = [...document.querySelectorAll('.tab-btn')];
    panels = {
      single: document.getElementById('panel-single'),
      batch: document.getElementById('panel-batch')
    };

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => activate(btn.dataset.tab));
      btn.addEventListener('keydown', onKeydown);
    });

    // restaura última tab usada
    let initial = 'single';
    try { initial = localStorage.getItem(LS_KEY) || 'single'; } catch (_) {}
    activate(panels[initial] ? initial : 'single', false);
  }

  // abas marcadas com [disabled] estão bloqueadas (ex.: "Em breve")
  function isDisabled(name) {
    const btn = buttons.find((b) => b.dataset.tab === name);
    return !!(btn && btn.disabled);
  }

  function activate(name, focus = true) {
    if (isDisabled(name)) return; // bloqueia abas indisponíveis
    buttons.forEach((btn) => {
      const selected = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      if (selected && focus) btn.focus();
    });
    Object.entries(panels).forEach(([key, panel]) => {
      panel.classList.toggle('hidden', key !== name);
    });
    try { localStorage.setItem(LS_KEY, name); } catch (_) {}
  }

  // navegação por setas entre tabs (padrão ARIA)
  function onKeydown(e) {
    const idx = buttons.indexOf(e.currentTarget);
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % buttons.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    if (next !== null) {
      e.preventDefault();
      activate(buttons[next].dataset.tab);
    }
  }

  return { init };
})();

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', () => {
  Tabs.init();
  FormSingle.init();
  FormBatch.init();
});
