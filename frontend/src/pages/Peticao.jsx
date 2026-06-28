import { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Sparkles, Copy, Download, Clock, Scale, Save, Folder, FileText, X, Upload, File, Image } from 'lucide-react';
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
  { id: 'civel',       label: '⚖️ Cível' },
];

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_MB = 10;
const MAX_FILES = 5;

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
      if (total > MAX_FILES) {
        toast.error(`Máximo de ${MAX_FILES} arquivos permitidos`);
        return [...prev, ...novos.slice(0, MAX_FILES - prev.length)];
      }
      return [...prev, ...novos];
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
        DOCUMENTOS COMPROBATÓRIOS (opcional — máx. {MAX_FILES} arquivos, PDF/JPG/PNG, {MAX_SIZE_MB}MB cada)
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
          const r = await api.post('/peticao/gerar', {
            ...form,
            arquivos_contexto: arquivosContexto,
            arquivos_base64: base64Files,
          });
          setResultado(r.data.conteudo);
          setBuscas(r.data.buscas || []);
          setTokens(r.data.tokens_usados);
          if (r.data.peticaoId) setPeticaoId(r.data.peticaoId);
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

      const r = await api.post('/peticao/gerar', {
        ...form,
        arquivos_contexto: todosArquivos,
      });

      setResultado(r.data.conteudo);
      setBuscas(r.data.buscas || []);
      setTokens(r.data.tokens_usados);
      if (r.data.peticaoId) setPeticaoId(r.data.peticaoId);

      const TIPOS_LABEL = { liminar:'Tutela de Urgência', peticao_inicial:'Petição Inicial',
        contestacao:'Contestação', recurso_apelacao:'Apelação', embargos:'Embargos',
        manifestacao:'Manifestação', recurso_inominado:'Recurso Inominado', agravo:'Agravo' };
      setTitulo(`${TIPOS_LABEL[form.tipo_peca]||form.tipo_peca} — ${new Date().toLocaleDateString('pt-BR')}`);
      toast.success(form.client_id ? 'Peça gerada e salva na pasta do cliente!' : 'Peça gerada com sucesso!');
      api.get('/peticao/historico').then(r2 => setHistorico(r2.data || [])).catch(()=>{});

    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao gerar. Tente novamente.');
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
              <label style={lbl}>INCLUIR DOCUMENTOS EXISTENTES DO CLIENTE (máx. 3)</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6, background:'#f8f7f3', borderRadius:8, padding:10 }}>
                {clientFiles.map(f => (
                  <label key={f.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                    <input type="checkbox"
                      checked={arquivosContexto.includes(f.filename)}
                      disabled={!arquivosContexto.includes(f.filename) && arquivosContexto.length >= 3}
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
            <label style={lbl}>FATOS DO CASO *</label>
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
                <button onClick={() => window.open(api.defaults.baseURL + `/peticao/${peticaoId}/download/docx`, '_blank')}
                  disabled={!peticaoId}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                    background: peticaoId ? '#0d2340' : '#ccc', color:'#fff', border:'none', borderRadius:8,
                    fontSize:12, fontWeight:600, cursor: peticaoId ? 'pointer' : 'not-allowed' }}>
                  <Download size={13}/> Baixar Word (.docx)
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
            <p style={{ fontSize:11, color:'#6b6b68', margin:0 }}>
              ✏️ Você pode editar o texto diretamente antes de copiar ou baixar.
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
            {historico.slice(0,5).map(h => (
              <div key={h.id}
                style={{ background:'#fff', border:'1px solid #e5e2d6', borderRadius:8,
                  padding:'10px 14px', display:'flex', justifyContent:'space-between',
                  alignItems:'center', cursor:'pointer' }}
                onClick={() => setResultado(h.conteudo)}>
                <div>
                  <span style={{ fontSize:13, fontWeight:600 }}>
                    {TIPOS.find(t=>t.id===h.tipo_peca)?.label || h.tipo_peca}
                  </span>
                  {h.cliente_nome && <span style={{ fontSize:12, color:'#6b6b68', marginLeft:8 }}>— {h.cliente_nome}</span>}
                </div>
                <span style={{ fontSize:11, color:'#6b6b68' }}>
                  {new Date(h.created_at).toLocaleDateString('pt-BR')}
                </span>
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
