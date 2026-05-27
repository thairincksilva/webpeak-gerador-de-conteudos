// Camada de rede — todas as chamadas pro n8n passam por aqui.
// Não conhece DOM nem toasts; apenas faz requisições e devolve dados/erros.

const API = (() => {
  const url = (path) => `${CONFIG.N8N_BASE_URL}${path}`;

  // Erro de rede com mensagem amigável já pronta para exibir.
  class ApiError extends Error {
    constructor(message, { status = null, cause = null } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.cause = cause;
    }
  }

  // fetch com timeout via AbortController.
  async function fetchWithTimeout(resource, options = {}, timeoutMs) {
    const controller = new AbortController();
    const id = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetch(resource, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError('A requisição demorou demais e foi cancelada. Tente novamente.', { cause: err });
      }
      throw new ApiError('Falha de conexão. Verifique sua internet e tente novamente.', { cause: err });
    } finally {
      if (id) clearTimeout(id);
    }
  }

  async function parseJsonOrThrow(res) {
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.message || ''; } catch (_) { /* ignore */ }
      throw new ApiError(detail || `Erro do servidor (${res.status}).`, { status: res.status });
    }
    try {
      return await res.json();
    } catch (err) {
      throw new ApiError('Resposta inválida do servidor.', { cause: err });
    }
  }

  // --- Conteúdo único ---
  // payload: objeto serializável. Retorna { content, title? } (formato flexível).
  async function generateSingle(payload) {
    const res = await fetchWithTimeout(
      url(CONFIG.ENDPOINTS.single),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      CONFIG.SINGLE_TIMEOUT_MS
    );
    return parseJsonOrThrow(res);
  }

  // --- Geração em massa: envia planilha ---
  // file: File; defaults: objeto. Retorna { jobId, total? }.
  async function startBatch(file, defaults) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('defaults', JSON.stringify(defaults || {}));
    const res = await fetchWithTimeout(
      url(CONFIG.ENDPOINTS.batch),
      { method: 'POST', body: fd }, // sem Content-Type: o browser define o boundary
      CONFIG.SINGLE_TIMEOUT_MS
    );
    return parseJsonOrThrow(res);
  }

  // --- Status do job ---
  // Retorna { status: 'pending'|'processing'|'done'|'error', processed, total, etaMs?, resultUrl?, message? }
  async function getJobStatus(jobId) {
    const res = await fetchWithTimeout(
      url(`${CONFIG.ENDPOINTS.status}/${encodeURIComponent(jobId)}`),
      { method: 'GET' },
      30000
    );
    return parseJsonOrThrow(res);
  }

  return { generateSingle, startBatch, getJobStatus, ApiError };
})();
