import { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Sparkles, Copy, Download, Clock, Scale, Save, Folder, FileText, X, Upload, File, Image, Trash2, Wand2, Undo2, MessageCircleQuestion, Mic, MicOff } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { useNavigate } from 'react-router-dom';

const TIPOS = [
  { id: 'liminar',          label: '⚡ Tutela de Urgência (Liminar)' },
  { id: 'peticao_inicial',  label: '📄 Petição Inicial' },
  { id: 'contestacao',      label: '🛡️ Contestação' },
  { id: 'recurso_inominado',label: '📋 Recurso Inominado (JEC)' },
  { id: 'recurso_apelacao', label: '⬆️ Recurso de Apelação' },
  { id: 'embargos',         label: '🔍 Embargos de Declaração' },
  { id: 'manifestacao',     label: '💬 Manifestação / Impugnação' },
  { id: 'agravo',           label: '📑 Agravo Regimental' },
];

const AREAS = [
  { id: 'medico',      label: '🏥 Direito Médico e da Saúde' },
  { id: 'inventarios', label: '📜 Inventário e Sucessões' },
  { id: 'jec',         label: '🏛️ JEC — Juizado Especial Cível' },
  { id: 'civel',       label: '⚖️ Cível' },
];

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_MB = 10;
const MAX_TOTAL_MB = 20; // limite da API de IA (requisição máx ~32MB em base64)
const MAX_FILES = 20;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function FileIcon({ mimetype }) {
  if (mimetype === 'application/pdf') return <File size={14} color="#dc2626" />;
  return <Image size={14} color="#0d2340" />;
}

// Componente de upload drag & drop
function UploadZone({ arquivosNovos, setArquivosNovos, uploading }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  function validarArquivos(files) {
    const validos = [];
    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error(`Tipo não permitido: ${f.name} (use PDF, JPG ou PNG)`);
        continue;
      }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`Arquivo muito grande: ${f.name} (máx. ${MAX_SIZE_MB}MB)`);
        continue;
      }
      validos.push(f);
    }
    return validos;
  }

  function adicionarArquivos(files) {
    const novos = validarArquivos(Array.from(files));
    setArquivosNovos(prev => {
      const total = prev.length + novos.length;
      let lista = total > MAX_FILES
        ? [...prev, ...novos.slice(0, MAX_FILES - prev.length)]
        : [...prev, ...novos];
      if (total > MAX_FILES) toast.error(`Máximo de ${MAX_FILES} arquivos permitidos`);

      // Limite total combinado (a API de IA aceita ~32MB por requisição)
      const totalBytes = lista.reduce((s, f) => s + f.size, 0);
      if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
        toast.error(`Tamanho total excede ${MAX_TOTAL_MB}MB. Remova alguns arquivos ou use versões comprimidas.`);
      }
      return lista;
    });
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    adicionarArquivos(e.dataTransfer.files);
  }

  function remover(idx) {
    setArquivosNovos(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label style={lbl}>
        DOCUMENTOS COMPROBATÓRIOS (opcional — máx. {MAX_FILES} arquivos, PDF/JPG/PNG, {MAX_SIZE_MB}MB cada, {MAX_TOTAL_MB}MB no total)
      </label>

      {/* Zona de drop */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? '#0d2340' : '#c5a859'}`,
          borderRadius: 10,
          padding: '18px 16px',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          background: dragging ? '#f0f4ff' : '#fdfcf8',
          transition: 'all 0.2s',
          marginBottom: arquivosNovos.length > 0 ? 8 : 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={e => adicionarArquivos(e.target.files)}
          disabled={uploading}
        />
        <Upload size={20} color="#c5a859" style={{ marginBottom: 6 }} />
        <p style={{ margin: '4px 0 2px', fontSize: 13, fontWeight: 600, color: '#0d2340' }}>
          Clique ou arraste arquivos aqui
        </p>
        <p style={{ margin: 0, fontSize: 11, color: '#6b6b68' }}>
          Laudos médicos, negativas, receitas, contratos, fotos — PDF, JPG, PNG
        </p>
      </div>

      {/* Lista de arquivos selecionados */}
      {arquivosNovos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {arquivosNovos.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f8f7f3', borderRadius: 7, padding: '6px 10px',
              border: '1px solid #e5e2d6',
            }}>
              <FileIcon mimetype={f.type} />
              <span style={{ flex: 1, fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              <span style={{ fontSize: 11, color: '#6b6b68', flexShrink: 0 }}>
                {formatBytes(f.size)}
              </span>
              {!uploading && (
                <button onClick={() => remover(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                  <X size={13} color="#6b6b68" />
                </button>
              )}
            </div>
          ))}
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#166534', fontWeight: 600 }}>
            📎 {arquivosNovos.length} arquivo(s) serão enviados à IA como contexto da petição
          </p>
        </div>
      )}
    </div>
  );
}

export default function Peticao() {
  const [clientes, setClientes]     = useState([]);
  const [processos, setProcessos]   = useState([]);
  const [historico, setHistorico]   = useState([]);

  const [form, setForm] = useState({
    client_id: '', processo_id: '', tipo_peca: 'liminar',
    area: 'medico', fatos: '', pedidos: '', tribunal: '',
  });

  const navigate = useNavigate();
  const [clientFiles, setClientFiles]         = useState([]);
  const [arquivosContexto, setArquivosContexto] = useState([]);  // arquivos já na pasta do cliente
  const [arquivosNovos, setArquivosNovos]     = useState([]);    // arquivos novos para upload agora
  const [uploading, setUploading]             = useState(false);
  const [peticaoId, setPeticaoId]             = useState(null);
  const [titulo, setTitulo]                   = useState('');
  const [salvando, setSalvando]               = useState(false);
  const [gerando, setGerando]                 = useState(false);
  const [instrucaoAjuste, setInstrucaoAjuste] = useState('');
  const [ajustando, setAjustando]             = useState(false);
  const [versaoAnterior, setVersaoAnterior]   = useState(null);
  const [perguntando, setPerguntando]         = useState(false);
  const [respostaIA, setRespostaIA]           = useState(null); // { pergunta, resposta }
  const [ditando, setDitando]                 = useState(false);
  const recognitionRef = useRef(null);

  // Ditado por voz (Web Speech API do navegador — grátis, funciona no Chrome/Edge/Android)
  function alternarDitado() {
    if (ditando) {
      recognitionRef.current?.stop();
      setDitando(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Seu navegador não suporta ditado por voz. Use o Chrome (computador ou Android).');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      let textoNovo = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) textoNovo += event.results[i][0].transcript + ' ';
      }
      if (textoNovo) setFatos(prev => (prev ? prev.trimEnd() + ' ' : '') + textoNovo.trim() + ' ');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') toast.error('Permita o acesso ao microfone para ditar.');
      setDitando(false);
    };
    rec.onend = () => setDitando(false);

    recognitionRef.current = rec;
    rec.start();
    setDitando(true);
    toast('🎤 Ditando... fale os fatos do caso. Clique de novo para parar.', { duration: 4000 });
  }
  const [resultado, setResultado]             = useState(null);
  const [buscas, setBuscas]                   = useState([]);
  const [tokens, setTokens]                   = useState(null);

  useEffect(() => {
    api.get('/clients').then(r => setClientes(r.data || [])).catch(()=>{});
    api.get('/processos').then(r => setProcessos(r.data?.processos || r.data || [])).catch(()=>{});
    api.get('/peticao/historico').then(r => setHistorico(r.data || [])).catch(()=>{});
  }, []);

  const processosFiltrados = form.client_id
    ? processos.filter(p => String(p.client_id) === String(form.client_id))
    : processos;

  useEffect(() => {
    if (!form.client_id) { setClientFiles([]); return; }
    api.get(`/clients/${form.client_id}`)
      .then(r => setClientFiles(r.data?.files || []))
      .catch(()=>{});
  }, [form.client_id]);

  // Faz upload dos arquivos novos para a pasta do cliente (se cliente selecionado)
  // e retorna os filenames para enviar à IA
  async function uploadArquivosNovos() {
    if (arquivosNovos.length === 0) return [];

    // Se não tem cliente selecionado, envia direto como base64 (sem salvar)
    if (!form.client_id) {
      return arquivosNovos.map(f => ({ _file: f })); // será tratado no backend via base64
    }

    setUploading(true);
    try {
      const formData = new FormData();
      arquivosNovos.forEach(f => formData.append('files', f));

      const r = await api.post(`/clients/${form.client_id}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Retornar os filenames salvos para passar à IA
      return (r.data.files || []).map(f => f.filename);
    } finally {
      setUploading(false);
    }
  }

  // Aguarda o job de geração terminar, consultando o status a cada 3s (máx. 5 min)
  async function aguardarJob(jobId) {
    const inicio = Date.now();
    while (Date.now() - inicio < 5 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await api.get(`/peticao/gerar/status/${jobId}`);
      if (s.data.status === 'done') return s.data;
      if (s.data.status === 'error') throw new Error(s.data.error || 'Erro na geração');
    }
    throw new Error('Tempo esgotado. A peça pode ter sido salva — verifique o histórico.');
  }

  async function gerar() {
    if (!form.tipo_peca || !form.fatos.trim()) return toast.error('Preencha o tipo de peça e os fatos do caso');
    setGerando(true); setResultado(null); setBuscas([]); setPeticaoId(null);

    try {
      // 1. Fazer upload dos arquivos novos (se houver)
      let nomesArquivosNovos = [];
      if (arquivosNovos.length > 0) {
        if (form.client_id) {
          // Salva na pasta do cliente e obtém filenames
          setUploading(true);
          try {
            const formData = new FormData();
            arquivosNovos.forEach(f => formData.append('files', f));
            const r = await api.post(`/clients/${form.client_id}/files`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            nomesArquivosNovos = (r.data.files || []).map(f => f.filename);
            toast.success(`${arquivosNovos.length} arquivo(s) salvos na pasta do cliente`);
            // Atualizar lista de arquivos do cliente
            api.get(`/clients/${form.client_id}`).then(r2 => setClientFiles(r2.data?.files || [])).catch(()=>{});
          } finally {
            setUploading(false);
          }
        } else {
          // Sem cliente: envia os arquivos como base64 diretamente no corpo da requisição
          const base64Files = await Promise.all(
            arquivosNovos.map(f => new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({
                name: f.name,
                type: f.type,
                data: reader.result.split(',')[1],
              });
              reader.onerror = reject;
              reader.readAsDataURL(f);
            }))
          );
          // Passa como campo especial para o backend processar
          const start = await api.post('/peticao/gerar', {
            ...form,
            arquivos_contexto: arquivosContexto,
            arquivos_base64: base64Files,
          });
          const jobData = await aguardarJob(start.data.jobId);
          setResultado(jobData.conteudo);
          setBuscas(jobData.buscas || []);
          if (jobData.peticaoId) setPeticaoId(jobData.peticaoId);
          const TIPOS_LABEL = { liminar:'Tutela de Urgência', peticao_inicial:'Petição Inicial',
            contestacao:'Contestação', recurso_apelacao:'Apelação', embargos:'Embargos',
            manifestacao:'Manifestação', recurso_inominado:'Recurso Inominado', agravo:'Agravo' };
          setTitulo(`${TIPOS_LABEL[form.tipo_peca]||form.tipo_peca} — ${new Date().toLocaleDateString('pt-BR')}`);
          toast.success('Peça gerada com sucesso!');
          api.get('/peticao/historico').then(r2 => setHistorico(r2.data || [])).catch(()=>{});
          return;
        }
      }

      // 2. Gerar a petição com todos os arquivos (contexto existente + novos)
      const todosArquivos = [...arquivosContexto, ...nomesArquivosNovos];

      const start = await api.post('/peticao/gerar', {
        ...form,
        arquivos_contexto: todosArquivos,
      });
      const jobData = await aguardarJob(start.data.jobId);

      setResultado(jobData.conteudo);
      setBuscas(jobData.buscas || []);
      if (jobData.peticaoId) setPeticaoId(jobData.peticaoId);

      const TIPOS_LABEL = { liminar:'Tutela de Urgência', peticao_inicial:'Petição Inicial',
        contestacao:'Contestação', recurso_apelacao:'Apelação', embargos:'Embargos',
        manifestacao:'Manifestação', recurso_inominado:'Recurso Inominado', agravo:'Agravo' };
      setTitulo(`${TIPOS_LABEL[form.tipo_peca]||form.tipo_peca} — ${new Date().toLocaleDateString('pt-BR')}`);
      toast.success(form.client_id ? 'Peça gerada e salva na pasta do cliente!' : 'Peça gerada com sucesso!');
      api.get('/peticao/historico').then(r2 => setHistorico(r2.data || [])).catch(()=>{});

    } catch(e) {
      toast.error(e.message || e.response?.data?.error || 'Erro ao gerar. Tente novamente.');
      // Atualiza o histórico mesmo em erro — a peça pode ter sido salva
      api.get('/peticao/historico').then(r2 => setHistorico(r2.data || [])).catch(()=>{});
    } finally {
      setGerando(false);
    }
  }

  async function salvarEdicao() {
    if (!peticaoId) return toast.error('Selecione um cliente e gere a peça primeiro');
    setSalvando(true);
    try {
      await api.put(`/peticao/${peticaoId}`, { titulo, conteudo: resultado });
      toast.success('Peça salva!');
    } catch(e) { toast.error('Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  function copiar() {
    navigator.clipboard.writeText(resultado);
    toast.success('Copiado!');
  }

  // Download autenticado — window.open não envia o token JWT, causava "Token não fornecido"
  async function baixarArquivo(formato) {
    if (!peticaoId) return toast.error('Selecione um cliente e gere a peça para poder baixar');
    const toastId = toast.loading(formato === 'pdf' ? 'Gerando PDF...' : 'Gerando Word...');
    try {
      const r = await api.get(`/peticao/${peticaoId}/download/${formato}`, {
        responseType: 'blob',
        timeout: 90000, // conversão PDF pode demorar
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(titulo || 'peticao').replace(/[^a-zA-Z0-9À-ú\s._-]/g, '_')}.${formato === 'pdf' ? 'pdf' : 'docx'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(formato === 'pdf' ? 'PDF baixado!' : 'Word baixado!', { id: toastId });
    } catch(e) {
      toast.error('Erro ao baixar. Tente novamente.', { id: toastId });
    }
  }

  async function aplicarAjustes() {
    if (!instrucaoAjuste.trim()) return toast.error('Descreva os ajustes que deseja fazer');
    if (!resultado) return toast.error('Gere ou abra uma peça primeiro');

    setAjustando(true);
    setVersaoAnterior(resultado); // permite desfazer
    const toastId = toast.loading('Aplicando ajustes na peça...');

    try {
      const start = await api.post('/peticao/ajustar', {
        conteudo: resultado,
        instrucao: instrucaoAjuste,
        peticaoId: peticaoId || null,
      });
      const jobData = await aguardarJob(start.data.jobId);

      setResultado(jobData.conteudo);
      if (jobData.buscas?.length > 0) setBuscas(prev => [...prev, ...jobData.buscas]);
      setInstrucaoAjuste('');
      toast.success('Ajustes aplicados! Revise as alterações.', { id: toastId });
    } catch(e) {
      setVersaoAnterior(null);
      toast.error(e.message || 'Erro ao aplicar ajustes. Tente novamente.', { id: toastId });
    } finally {
      setAjustando(false);
    }
  }

  function desfazerAjuste() {
    if (!versaoAnterior) return;
    setResultado(versaoAnterior);
    setVersaoAnterior(null);
    toast.success('Versão anterior restaurada. Clique em "Salvar edições" para persistir.');
  }

  async function perguntar() {
    if (!instrucaoAjuste.trim()) return toast.error('Escreva sua pergunta');
    if (!resultado) return toast.error('Gere ou abra uma peça primeiro');

    setPerguntando(true);
    const perguntaFeita = instrucaoAjuste;
    const toastId = toast.loading('Analisando a peça e respondendo...');

    try {
      const start = await api.post('/peticao/perguntar', {
        conteudo: resultado,
        pergunta: perguntaFeita,
      });
      const jobData = await aguardarJob(start.data.jobId);

      setRespostaIA({ pergunta: perguntaFeita, resposta: jobData.resposta });
      setInstrucaoAjuste('');
      toast.success('Resposta pronta!', { id: toastId });
    } catch(e) {
      toast.error(e.message || 'Erro ao responder. Tente novamente.', { id: toastId });
    } finally {
      setPerguntando(false);
    }
  }

  function abrirDoHistorico(h) {
    setResultado(h.conteudo);
    setPeticaoId(h.id);                    // habilita o botão de baixar Word
    setTitulo(h.titulo || `${TIPOS.find(t=>t.id===h.tipo_peca)?.label || h.tipo_peca} — ${new Date(h.created_at).toLocaleDateString('pt-BR')}`);
    setForm(p => ({ ...p, client_id: h.client_id || p.client_id }));
    try { setBuscas(h.buscas ? JSON.parse(h.buscas) : []); } catch { setBuscas([]); }
  }

  async function excluirPeticao(id, e) {
    e.stopPropagation(); // não abrir a petição ao clicar no lixeira
    if (!window.confirm('Excluir esta peça do histórico? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/peticao/${id}`);
      setHistorico(prev => prev.filter(h => h.id !== id));
      toast.success('Peça excluída.');
    } catch(err) {
      toast.error('Erro ao excluir. Tente novamente.');
    }
  }

  const isGerando = gerando || uploading;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0d2340', margin: 0, display:'flex', alignItems:'center', gap:8, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
          <Scale size={20} color="#c5a859" /> Petição Assistida por IA
        </h2>
        <p style={{ fontSize: 13, color: '#6b6b68', margin: '4px 0 0' }}>
          Gera peças completas com jurisprudência real pesquisada em tempo real
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: resultado ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        {/* Formulário */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Tipo + Área */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>TIPO DE PEÇA</label>
              <select value={form.tipo_peca} onChange={e=>setForm(p=>({...p,tipo_peca:e.target.value}))} style={inp}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>ÁREA DO DIREITO</label>
              <select value={form.area} onChange={e=>setForm(p=>({...p,area:e.target.value}))} style={inp}>
                {AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {/* Cliente + Processo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>CLIENTE (opcional)</label>
              <SearchableSelect
                value={form.client_id}
                onChange={val => setForm(p => ({ ...p, client_id: val, processo_id: '' }))}
                options={clientes.map(c => ({ value: c.id, label: c.nome }))}
                placeholder="Selecionar cliente"
              />
            </div>
            <div>
              <label style={lbl}>PROCESSO (opcional)</label>
              <SearchableSelect
                value={form.processo_id}
                onChange={val => setForm(p => ({ ...p, processo_id: val }))}
                options={processosFiltrados.map(p => ({ value: p.id, label: p.numero_cnj }))}
                placeholder="Selecionar processo"
              />
            </div>
          </div>

          {/* Upload de novos documentos comprobatórios */}
          <UploadZone
            arquivosNovos={arquivosNovos}
            setArquivosNovos={setArquivosNovos}
            uploading={isGerando}
          />

          {/* Documentos já na pasta do cliente como contexto adicional */}
          {clientFiles.length > 0 && (
            <div>
              <label style={lbl}>INCLUIR DOCUMENTOS EXISTENTES DO CLIENTE (máx. 20)</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6, background:'#f8f7f3', borderRadius:8, padding:10 }}>
                {clientFiles.map(f => (
                  <label key={f.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                    <input type="checkbox"
                      checked={arquivosContexto.includes(f.filename)}
                      disabled={!arquivosContexto.includes(f.filename) && arquivosContexto.length >= 20}
                      onChange={e => {
                        if (e.target.checked) setArquivosContexto(prev => [...prev, f.filename]);
                        else setArquivosContexto(prev => prev.filter(x => x !== f.filename));
                      }}
                    />
                    <FileIcon mimetype={f.mimetype || f.file_type} />
                    <span style={{ color:'#333' }}>{f.original_name || f.original_filename || f.filename}</span>
                    <span style={{ fontSize:11, color:'#6b6b68' }}>({f.mimetype || f.file_type})</span>
                  </label>
                ))}
                {arquivosContexto.length > 0 && (
                  <p style={{ margin:'4px 0 0', fontSize:11, color:'#0d2340', fontWeight:600 }}>
                    ✅ {arquivosContexto.length} arquivo(s) existente(s) incluídos como contexto
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tribunal */}
          <div>
            <label style={lbl}>TRIBUNAL / VARA</label>
            <input placeholder="Ex: 3ª Vara Cível de São Paulo / TJSP / JEC" value={form.tribunal}
              onChange={e=>setForm(p=>({...p,tribunal:e.target.value}))} style={inp} />
          </div>

          {/* Fatos */}
          <div>
<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <label style={lbl}>FATOS DO CASO *</label>
              <button type="button" onClick={alternarDitado}
                title={ditando ? 'Parar ditado' : 'Ditar por voz (grátis, via navegador)'}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px',
                  background: ditando ? '#dc2626' : '#f0f4ff', color: ditando ? '#fff' : '#0d2340',
                  border: ditando ? 'none' : '1px solid #c7d2fe', borderRadius:20, fontSize:11.5,
                  fontWeight:700, cursor:'pointer' }}>
                {ditando ? <><MicOff size={12}/> Parar</> : <><Mic size={12}/> Ditar por voz</>}
              </button>
            </div>
            <textarea
              placeholder={`Descreva os fatos em detalhes. Ex:\n"Cliente Maria, 65 anos, possui plano de saúde Amil há 12 anos. Em 15/05/2026, o plano negou cobertura para cirurgia de catarata bilateral, alegando ausência de cobertura. O médico Dr. João prescreveu o procedimento como urgente (CID H25.1). A negativa foi por escrito em 20/05/2026..."`}
              value={form.fatos}
              onChange={e=>setForm(p=>({...p,fatos:e.target.value}))}
              rows={8}
              style={{...inp, resize:'vertical', lineHeight:1.5}}
            />
          </div>

          {/* Pedidos */}
          <div>
            <label style={lbl}>PEDIDOS ESPECÍFICOS (opcional)</label>
            <textarea
              placeholder="Ex: Liminar para autorizar cirurgia em 48h; condenação em danos morais de R$ 15.000..."
              value={form.pedidos}
              onChange={e=>setForm(p=>({...p,pedidos:e.target.value}))}
              rows={3}
              style={{...inp, resize:'vertical'}}
            />
          </div>

          {/* Botão gerar */}
          <button onClick={gerar} disabled={isGerando}
            style={{ background: isGerando ? '#ccc' : 'linear-gradient(135deg,#0d2340,#1a3a5c)',
              color:'#fff', border:'none', borderRadius:10, padding:'14px',
              fontWeight:700, fontSize:15, cursor: isGerando ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Sparkles size={18} />
            {uploading ? 'Enviando arquivos...' : gerando ? 'Pesquisando jurisprudência e redigindo...' : 'Gerar Peça com IA'}
          </button>

          {/* Banner de segurança jurídica */}
          <div style={{ background:'#fff8f1', border:'1.5px solid #fed7aa', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
            <p style={{ margin:'0 0 4px', fontWeight:700, color:'#c2410c' }}>⚠️ Segurança jurídica — leia antes de usar</p>
            <p style={{ margin:0, color:'#7c2d12', lineHeight:1.5 }}>
              A IA pesquisa jurisprudência real via busca web e cita apenas o que encontra. Onde não encontrar decisão verificada, inserirá <strong>[JURISPRUDÊNCIA PENDENTE]</strong> para você completar manualmente.
              <strong> Sempre revise as citações antes de protocolar.</strong>
            </p>
          </div>

          {isGerando && (
            <div style={{ background:'#f0f7ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1e40af' }}>
              {uploading
                ? '📤 Salvando documentos na pasta do cliente...'
                : '⏳ Analisando documentos e pesquisando jurisprudência em tempo real. Isso pode levar 30–90 segundos...'}
            </div>
          )}

          {/* Buscas realizadas */}
          {buscas.length > 0 && (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px' }}>
              <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:600, color:'#166534' }}>
                🔍 Jurisprudência pesquisada em tempo real:
              </p>
              {buscas.map((b,i) => <p key={i} style={{ margin:'2px 0', fontSize:11, color:'#166534' }}>• {b}</p>)}
              {tokens && <p style={{ margin:'6px 0 0', fontSize:10, color:'#6b6b68' }}>{tokens.toLocaleString()} tokens gerados</p>}
            </div>
          )}
        </div>

        {/* Resultado */}
        {resultado && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ background:'#fef9c3', border:'1px solid #fde047', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#854d0e' }}>
              <strong>Antes de protocolar:</strong> revise cada citação jurisprudencial. Itens marcados como <code>[JURISPRUDÊNCIA PENDENTE]</code> devem ser pesquisados e inseridos por você.
            </div>
            <input value={titulo} onChange={e=>setTitulo(e.target.value)}
              placeholder="Título da peça"
              style={{ width:'100%', boxSizing:'border-box', padding:'8px 12px', border:'1px solid #d0cfc7', borderRadius:8, fontSize:13, fontWeight:600 }} />

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:14, fontWeight:700, color:'#0d2340' }}>Peça gerada</span>
              <div style={{ display:'flex', gap:8 }}>
                {peticaoId && (
                  <button onClick={salvarEdicao} disabled={salvando}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                      background:'#166534', color:'#fff', border:'none', borderRadius:8,
                      fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    <Save size={13}/> {salvando ? 'Salvando...' : 'Salvar edições'}
                  </button>
                )}
                {peticaoId && form.client_id && (
                  <button onClick={() => navigate(`/clients/${form.client_id}`)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                      background:'#0d2340', color:'#fff', border:'none', borderRadius:8,
                      fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    <Folder size={13}/> Ver pasta do cliente
                  </button>
                )}
                <button onClick={copiar}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                    background:'#f0f0ec', border:'1px solid #d0cfc7', borderRadius:8,
                    fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  <Copy size={13}/> Copiar
                </button>
                <button onClick={() => baixarArquivo('docx')}
                  disabled={!peticaoId}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                    background: peticaoId ? '#0d2340' : '#ccc', color:'#fff', border:'none', borderRadius:8,
                    fontSize:12, fontWeight:600, cursor: peticaoId ? 'pointer' : 'not-allowed' }}>
                  <Download size={13}/> Word
                </button>
                <button onClick={() => baixarArquivo('pdf')}
                  disabled={!peticaoId}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                    background: peticaoId ? '#7a1f1f' : '#ccc', color:'#fff', border:'none', borderRadius:8,
                    fontSize:12, fontWeight:600, cursor: peticaoId ? 'pointer' : 'not-allowed' }}>
                  <Download size={13}/> PDF
                </button>
              </div>
            </div>
            <textarea
              value={resultado}
              onChange={e=>setResultado(e.target.value)}
              style={{ flex:1, minHeight:600, padding:'1rem', border:'1px solid #d0cfc7',
                borderRadius:10, fontSize:12, lineHeight:1.7, fontFamily:'Georgia,serif',
                resize:'vertical', background:'#fafaf8' }}
            />
            {/* ─── Alerta de pendências na peça ─── */}
            {(() => {
              const pendencias = (resultado.match(/\[[^\]]*PENDENTE[^\]]*\]/gi) || []);
              if (pendencias.length === 0) return null;
              return (
                <div style={{ background:'#fef2f2', border:'2px solid #dc2626', borderRadius:10, padding:'12px 14px' }}>
                  <p style={{ margin:'0 0 6px', fontSize:13, fontWeight:800, color:'#dc2626' }}>
                    ⚠️ {pendencias.length} DADO(S) PENDENTE(S) NA PEÇA — revise antes de protocolar:
                  </p>
                  {pendencias.map((p, i) => (
                    <p key={i} style={{ margin:'2px 0', fontSize:12.5, fontWeight:700, color:'#dc2626' }}>• {p}</p>
                  ))}
                  <p style={{ margin:'6px 0 0', fontSize:11, color:'#7f1d1d' }}>
                    Esses marcadores aparecem em vermelho e negrito no Word/PDF. Complete os dados editando o texto ou peça pelo chat de ajustes abaixo.
                  </p>
                </div>
              );
            })()}

            {/* ─── Ajustes por comando (chat de correções) ─── */}
            <div style={{ background:'#fff', border:'1.5px solid #c5a859', borderRadius:10, padding:'12px 14px' }}>
              <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:700, color:'#0d2340', display:'flex', alignItems:'center', gap:6 }}>
                <Wand2 size={14} color="#c5a859" /> Ajustar ou perguntar sobre a peça
              </p>
              <textarea
                value={instrucaoAjuste}
                onChange={e => setInstrucaoAjuste(e.target.value)}
                placeholder={'Descreva um ajuste OU faça uma pergunta. Ex:\n• Ajuste: "Inclua pedido de justiça gratuita"\n• Ajuste: "Aumente os danos morais para R$ 20.000"\n• Pergunta: "Por que você incluiu o pedido de tutela de urgência?"\n• Pergunta: "Essa jurisprudência citada ainda é válida?"'}
                rows={3}
                disabled={ajustando}
                style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', border:'1px solid #d0cfc7',
                  borderRadius:8, fontSize:12, resize:'vertical', marginBottom:8, lineHeight:1.5 }}
              />
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={aplicarAjustes} disabled={ajustando || perguntando || !instrucaoAjuste.trim()}
                  style={{ flex:1, minWidth:180, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    padding:'10px', background: (ajustando || perguntando) ? '#ccc' : 'linear-gradient(135deg,#0d2340,#1a3a5c)',
                    color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700,
                    cursor: (ajustando || perguntando) ? 'not-allowed' : 'pointer' }}>
                  <Wand2 size={14} />
                  {ajustando ? 'Aplicando... (até 1 min)' : 'Aplicar ajustes'}
                </button>
                <button onClick={perguntar} disabled={ajustando || perguntando || !instrucaoAjuste.trim()}
                  title="Pergunta sobre a peça — não altera o texto"
                  style={{ flex:1, minWidth:150, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    padding:'10px', background:'#fff',
                    color: (ajustando || perguntando) ? '#999' : '#0d2340',
                    border:'1.5px solid #0d2340', borderRadius:8, fontSize:13, fontWeight:700,
                    cursor: (ajustando || perguntando) ? 'not-allowed' : 'pointer' }}>
                  <MessageCircleQuestion size={14} />
                  {perguntando ? 'Analisando...' : 'Perguntar (não altera)'}
                </button>
                {versaoAnterior && !ajustando && (
                  <button onClick={desfazerAjuste}
                    title="Restaurar versão anterior ao último ajuste"
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'10px 14px',
                      background:'#f0f0ec', border:'1px solid #d0cfc7', borderRadius:8,
                      fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    <Undo2 size={13} /> Desfazer
                  </button>
                )}
              </div>
            </div>

            {/* Resposta da IA às perguntas */}
            {respostaIA && (
              <div style={{ background:'#f0f7ff', border:'1.5px solid #bfdbfe', borderRadius:10, padding:'12px 14px', position:'relative' }}>
                <button onClick={() => setRespostaIA(null)}
                  style={{ position:'absolute', top:8, right:8, background:'none', border:'none', cursor:'pointer', padding:4 }}>
                  <X size={14} color="#6b6b68" />
                </button>
                <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:700, color:'#1e40af', display:'flex', alignItems:'center', gap:6 }}>
                  <MessageCircleQuestion size={13} /> Sua pergunta:
                </p>
                <p style={{ margin:'0 0 10px', fontSize:12, color:'#374151', fontStyle:'italic' }}>
                  "{respostaIA.pergunta}"
                </p>
                <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:700, color:'#1e40af' }}>Resposta:</p>
                <div style={{ fontSize:13, color:'#1f2937', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                  {respostaIA.resposta}
                </div>
              </div>
            )}

            <p style={{ fontSize:11, color:'#6b6b68', margin:0 }}>
              ✏️ Você também pode editar o texto diretamente (clique e digite) e depois "Salvar edições". Peças revisadas viram referência para as próximas gerações da mesma área.
            </p>
          </div>
        )}
      </div>

      {/* Histórico */}
      {historico.length > 0 && !resultado && (
        <div style={{ marginTop:'2rem' }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'#0d2340', marginBottom:10,
            display:'flex', alignItems:'center', gap:6 }}>
            <Clock size={14}/> Histórico de peças geradas
          </h3>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {historico.slice(0,10).map(h => (
              <div key={h.id}
                style={{ background:'#fff', border:'1px solid #e5e2d6', borderRadius:8,
                  padding:'10px 14px', display:'flex', justifyContent:'space-between',
                  alignItems:'center', cursor:'pointer' }}
                onClick={() => abrirDoHistorico(h)}>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>
                    {TIPOS.find(t=>t.id===h.tipo_peca)?.label || h.tipo_peca}
                  </span>
                  {h.cliente_nome && <span style={{ fontSize:12, color:'#6b6b68', marginLeft:8 }}>— {h.cliente_nome}</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                  <span style={{ fontSize:11, color:'#6b6b68' }}>
                    {new Date(h.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  <button
                    onClick={(e) => excluirPeticao(h.id, e)}
                    title="Excluir peça"
                    style={{ display:'flex', alignItems:'center', justifyContent:'center',
                      background:'transparent', border:'none', cursor:'pointer',
                      padding:6, borderRadius:6, color:'#9a9a97', transition:'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fcebeb'; e.currentTarget.style.color = '#a32d2d'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9a9a97'; }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize:11, fontWeight:600, color:'#6b6b68', display:'block', marginBottom:4 };
const inp = { width:'100%', boxSizing:'border-box', padding:'9px 12px', border:'1px solid #d0cfc7', borderRadius:8, fontSize:13, background:'#fff' };








