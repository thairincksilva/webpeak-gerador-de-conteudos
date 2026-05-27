// Configuração da aplicação.
// Ajuste N8N_BASE_URL para a URL real do seu n8n.
const CONFIG = {
  N8N_BASE_URL: "https://worker.webpeak.com.br",
  ENDPOINTS: {
    single: "/webhook/generate-single",
    batch: "/webhook/generate-batch",
    status: "/webhook/job-status",
  },
  POLL_INTERVAL_MS: 4000,
  SINGLE_TIMEOUT_MS: 90000,
};
