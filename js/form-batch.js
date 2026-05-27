// Modo "Geração em Massa": template, upload com preview, processamento e
// acompanhamento via polling do status do job.

const FormBatch = (() => {
  const MAX_BYTES = 5 * 1024 * 1024; // 5MB
  const ACCEPT = ['.xlsx', '.csv'];

  let selectedFile = null;
  let parsedRows = [];   // todas as linhas (para validar schema)
  let pollTimer = null;
  let currentJobId = null;
  let resultUrl = null;

  let els = {};

  function init() {
    els = {
      setup: document.getElementById('batch-setup'),
      statusView: document.getElementById('batch-status'),
      template: document.getElementById('b-template'),
      dropzone: document.getElementById('b-dropzone'),
      file: document.getElementById('b-file'),
      fileName: document.getElementById('b-file-name'),
      fileErr: document.getElementById('b-file-err'),
      previewWrap: document.getElementById('b-preview-wrap'),
      previewTable: document.getElementById('b-preview-table'),
      process: document.getElementById('b-process'),
      // defaults
      defToggle: document.getElementById('b-defaults-toggle'),
      defBody: document.getElementById('b-defaults-body'),
      defChevron: document.getElementById('b-defaults-chevron'),
      // status
      statusTitle: document.getElementById('b-status-title'),
      statusText: document.getElementById('b-status-text'),
      progressBar: document.getElementById('b-progress-bar'),
      eta: document.getElementById('b-eta'),
      statusError: document.getElementById('b-status-error'),
      statusErrorMsg: document.getElementById('b-status-error-msg'),
      retry: document.getElementById('b-retry'),
      statusDone: document.getElementById('b-status-done'),
      downloadResult: document.getElementById('b-download-result'),
      newBatch: document.getElementById('b-new')
    };
    if (!els.setup) return;

    els.template.addEventListener('click', onTemplate);

    // dropzone: clique, teclado e drag&drop
    els.dropzone.addEventListener('click', () => els.file.click());
    els.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); }
    });
    els.file.addEventListener('change', (e) => handleFile(e.target.files[0]));
    ['dragover', 'dragenter'].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add('border-indigo-400', 'bg-indigo-50/40'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove('border-indigo-400', 'bg-indigo-50/40'); }));
    els.dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

    // defaults colapsável
    els.defToggle.addEventListener('click', toggleDefaults);

    els.process.addEventListener('click', onProcess);
    els.retry.addEventListener('click', onProcess);
    els.newBatch.addEventListener('click', resetToSetup);
    els.downloadResult.addEventListener('click', () => {
      if (resultUrl) window.open(resultUrl, '_blank');
    });
  }

  function onTemplate() {
    try {
      Template.download();
      UI.toast('Modelo baixado.', 'success');
    } catch (err) {
      UI.toast(err.message || 'Não foi possível gerar o modelo.', 'error');
    }
  }

  function toggleDefaults() {
    const open = els.defBody.classList.toggle('hidden') === false;
    els.defToggle.setAttribute('aria-expanded', String(open));
    els.defChevron.style.transform = open ? 'rotate(180deg)' : '';
  }

  // ---------- Upload + parse ----------
  function handleFile(file) {
    clearFileError();
    if (!file) return;

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPT.includes(ext)) {
      return fileError('Formato inválido. Envie um arquivo .xlsx ou .csv.');
    }
    if (file.size > MAX_BYTES) {
      return fileError('Arquivo muito grande. O limite é 5MB.');
    }

    selectedFile = file;
    els.fileName.textContent = `Selecionado: ${file.name}`;
    els.fileName.classList.remove('hidden');

    parseForPreview(file);
  }

  function parseForPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!parsedRows.length) {
          return fileError('A planilha está vazia.');
        }
        // valida schema mínimo
        const cols = Object.keys(parsedRows[0]).map((c) => c.toLowerCase().trim());
        const missing = Template.REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
        if (missing.length) {
          return fileError(`Coluna obrigatória ausente: ${missing.join(', ')}. Baixe o modelo para conferir o formato.`);
        }
        renderPreview(parsedRows.slice(0, 5));
        els.process.disabled = false;
        UI.toast(`${parsedRows.length} linha(s) carregada(s).`, 'success');
      } catch (err) {
        fileError('Não foi possível ler o arquivo. Verifique se está no formato correto.');
      }
    };
    reader.onerror = () => fileError('Falha ao ler o arquivo.');
    reader.readAsArrayBuffer(file);
  }

  function renderPreview(rows) {
    const cols = Object.keys(rows[0]);
    const thead = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r) =>
      `<tr>${cols.map((c) => `<td>${escapeHtml(String(r[c] ?? ''))}</td>`).join('')}</tr>`
    ).join('')}</tbody>`;
    els.previewTable.innerHTML = thead + tbody;
    els.previewWrap.classList.remove('hidden');
  }

  function fileError(msg) {
    selectedFile = null;
    parsedRows = [];
    els.process.disabled = true;
    els.previewWrap.classList.add('hidden');
    els.fileErr.textContent = msg;
    els.fileErr.classList.remove('hidden');
    UI.toast(msg, 'error');
  }
  function clearFileError() {
    els.fileErr.classList.add('hidden');
    els.fileErr.textContent = '';
  }

  // ---------- Defaults ----------
  const LENGTH_MAP = { curto: 'short', medio: 'medium', longo: 'long' };

  function collectDefaults() {
    return {
      tone: document.getElementById('d-tone').value,
      language: document.getElementById('d-lang').value,
      targetAudience: document.getElementById('d-audience').value,
      length: LENGTH_MAP[document.getElementById('d-length').value] || 'medium'
    };
  }

  // ---------- Processar ----------
  async function onProcess() {
    if (!selectedFile) {
      return UI.toast('Envie uma planilha antes de processar.', 'error');
    }
    showStatusView();
    setStatusRunning('Enviando planilha...', 'Aguarde, estamos iniciando o processamento.');

    try {
      const { jobId, total } = await API.startBatch(selectedFile, collectDefaults());
      if (!jobId) throw new API.ApiError('O servidor não retornou um identificador de job.');
      currentJobId = jobId;
      setStatusRunning('Processando...', `Processando 0 de ${total || parsedRows.length}...`);
      poll();
    } catch (err) {
      showStatusError(err instanceof API.ApiError ? err.message : 'Erro ao iniciar o processamento.');
    }
  }

  function poll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        const s = await API.getJobStatus(currentJobId);
        const total = s.total || parsedRows.length || 1;
        const processed = s.processed || 0;
        const pct = Math.min(100, Math.round((processed / total) * 100));
        els.progressBar.style.width = `${pct}%`;
        els.statusText.textContent = `Processando ${processed} de ${total}...`;
        els.eta.textContent = s.etaMs ? `Tempo estimado restante: ~${formatEta(s.etaMs)}` : '';

        if (s.status === 'done') {
          resultUrl = s.resultUrl || null;
          showStatusDone();
        } else if (s.status === 'error') {
          showStatusError(s.message || 'O processamento falhou no servidor.');
        } else {
          poll(); // continua o polling
        }
      } catch (err) {
        // erro de rede no polling: mostra erro com retry, sem perder o job
        showStatusError(err instanceof API.ApiError ? err.message : 'Falha ao consultar o status.', true);
      }
    }, CONFIG.POLL_INTERVAL_MS);
  }

  // ---------- Views de status ----------
  function showStatusView() {
    els.setup.classList.add('hidden');
    els.statusView.classList.remove('hidden');
  }
  function resetToSetup() {
    clearTimeout(pollTimer);
    currentJobId = null;
    resultUrl = null;
    els.statusView.classList.add('hidden');
    els.setup.classList.remove('hidden');
  }
  function setStatusRunning(title, text) {
    els.statusTitle.textContent = title;
    els.statusText.textContent = text;
    els.statusError.classList.add('hidden');
    els.statusDone.classList.add('hidden');
  }
  function showStatusDone() {
    clearTimeout(pollTimer);
    els.progressBar.style.width = '100%';
    els.statusTitle.textContent = 'Concluído!';
    els.statusText.textContent = 'Seu conteúdo foi gerado.';
    els.eta.textContent = '';
    els.statusError.classList.add('hidden');
    els.statusDone.classList.remove('hidden');
    els.downloadResult.disabled = !resultUrl;
    if (!resultUrl) {
      els.statusText.textContent = 'Concluído, mas o link do resultado não foi retornado.';
    }
    UI.toast('Processamento concluído!', 'success');
  }
  // pollFailed=true mantém o jobId para que "Tentar novamente" reabra o polling.
  function showStatusError(msg, pollFailed = false) {
    clearTimeout(pollTimer);
    els.statusError.classList.remove('hidden');
    els.statusDone.classList.add('hidden');
    els.statusErrorMsg.textContent = msg;
    els.retry.textContent = pollFailed ? 'Retomar acompanhamento' : 'Tentar novamente';
    els.retry.onclick = pollFailed ? poll : onProcess;
    UI.toast(msg, 'error');
  }

  // ---------- util ----------
  function formatEta(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}min ${s % 60}s`;
  }
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { init };
})();
