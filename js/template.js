// Geração do template .xlsx no client (SheetJS).
// Também expõe o schema mínimo esperado, reutilizado na validação do upload.

const Template = (() => {
  // Colunas do modelo. As marcadas em REQUIRED_COLUMNS são obrigatórias no upload.
  const COLUMNS = [
    'tipo',          // blog | social | email
    'titulo',
    'tema',          // obrigatório
    'tom',           // profissional | casual | tecnico | persuasivo
    'publico_alvo',
    'palavras_chave',// separadas por vírgula
    'tamanho',       // curto | medio | longo
    'idioma',        // pt-BR | en-US | es-ES
    'plataforma',    // instagram | linkedin | twitter (só p/ social)
    'assunto',       // linha de assunto (só p/ email)
    'instrucoes_extras'
  ];

  const REQUIRED_COLUMNS = ['tema'];

  // Linhas de exemplo para orientar o preenchimento.
  const EXAMPLE_ROWS = [
    {
      tipo: 'blog',
      titulo: '5 tendências de marketing para 2026',
      tema: 'Tendências de marketing digital',
      tom: 'profissional',
      publico_alvo: 'Pequenos empreendedores',
      palavras_chave: 'marketing, tendências, 2026',
      tamanho: 'medio',
      idioma: 'pt-BR',
      plataforma: '',
      assunto: '',
      instrucoes_extras: 'Incluir exemplos práticos'
    },
    {
      tipo: 'social',
      titulo: '',
      tema: 'Lançamento de produto',
      tom: 'casual',
      publico_alvo: 'Jovens 18-30',
      palavras_chave: 'novidade, lançamento',
      tamanho: 'curto',
      idioma: 'pt-BR',
      plataforma: 'instagram',
      assunto: '',
      instrucoes_extras: 'Usar emojis'
    }
  ];

  function download() {
    if (typeof XLSX === 'undefined') {
      throw new Error('Biblioteca de planilha (SheetJS) não carregou.');
    }
    const ws = XLSX.utils.json_to_sheet(EXAMPLE_ROWS, { header: COLUMNS });
    // larguras de coluna para legibilidade
    ws['!cols'] = COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 16) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'conteudos');
    XLSX.writeFile(wb, 'modelo-gerador-conteudo.xlsx');
  }

  return { COLUMNS, REQUIRED_COLUMNS, EXAMPLE_ROWS, download };
})();
