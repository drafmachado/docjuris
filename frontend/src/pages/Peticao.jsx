import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Sparkles, Copy, Download, Clock, Scale, Save, Folder, FileText, X } from 'lucide-react';
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

export default function Peticao() {
  const [clientes, setClientes]     = useState([]);
  const [processos, setProcessos]   = useState([]);
  const [historico, setHistorico]   = useState([]);

  const [form, setForm] = useState({
    client_id: '', processo_id: '', tipo_peca: 'liminar',
    area: 'medico', fatos: '', pedidos: '', tribunal: '',
  });

  const navigate = useNavigate();
  const [clientFiles, setClientFiles] = useState([]);
  const [arquivosContexto, setArquivosContexto] = useState([]);
  const [peticaoId, setPeticaoId]     = useState(null);
  const [titulo, setTitulo]           = useState('');
  const [salvando, setSalvando]       = useState(false);
  const [gerando, setGerando]         = useState(false);
  const [resultado, setResultado]   = useState(null);
  const [buscas, setBuscas]         = useState([]);
  const [tokens, setTokens]         = useState(null);

  useEffect(() => {
    api.get('/clients').then(r => setClientes(r.data || [])).catch(()=>{});
    api.get('/processos').then(r => setProcessos(r.data?.processos || r.data || [])).catch(()=>{});
    api.get('/peticao/historico').then(r => setHistorico(r.data || [])).catch(()=>{});
  }, []);

  const processosFiltrados = form.client_id
    ? processos.filter(p => String(p.client_id) === String(form.client_id))
    : processos;

  // Carregar arquivos do cliente selecionado
  useEffect(() => {
    if (!form.client_id) { setClientFiles([]); return; }
    api.get(`/clients/${form.client_id}`)
      .then(r => setClientFiles(r.data?.files || []))
      .catch(()=>{});
  }, [form.client_id]);

  async function gerar() {
    if (!form.tipo_peca || !form.fatos.trim()) return toast.error('Preencha o tipo de peça e os fatos do caso');
    setGerando(true); setResultado(null); setBuscas([]); setPeticaoId(null);
    try {
      const r = await api.post('/peticao/gerar', { ...form, arquivos_contexto: arquivosContexto });
      setResultado(r.data.conteudo);
      setBuscas(r.data.buscas || []);
      setTokens(r.data.tokens_usados);
      if (r.data.peticaoId) { setPeticaoId(r.data.peticaoId); }
      const TIPOS_LABEL = { liminar:'Tutela de Urgência', peticao_inicial:'Petição Inicial',
        contestacao:'Contestação', recurso_apelacao:'Apelação', embargos:'Embargos',
        manifestacao:'Manifestação', recurso_inominado:'Recurso Inominado', agravo:'Agravo' };
      setTitulo(`${TIPOS_LABEL[form.tipo_peca]||form.tipo_peca} — ${new Date().toLocaleDateString('pt-BR')}`);
      toast.success(form.client_id ? 'Peça gerada e salva na pasta do cliente!' : 'Peça gerada com sucesso!');
      api.get('/peticao/historico').then(r2 => setHistorico(r2.data || [])).catch(()=>{});
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao gerar. Tente novamente.'); }
    finally { setGerando(false); }
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

  function baixar() {
    const blob = new Blob([resultado], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.tipo_peca}_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
              <select value={form.client_id} onChange={e=>setForm(p=>({...p,client_id:e.target.value,processo_id:''}))} style={inp}>
                <option value="">Selecionar cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>PROCESSO (opcional)</label>
              <select value={form.processo_id} onChange={e=>setForm(p=>({...p,processo_id:e.target.value}))} style={inp}>
                <option value="">Selecionar processo</option>
                {processosFiltrados.map(p => <option key={p.id} value={p.id}>{p.numero_cnj}</option>)}
              </select>
            </div>
          </div>

          {/* Documentos do cliente como contexto */}
          {clientFiles.length > 0 && (
            <div>
              <label style={lbl}>INCLUIR DOCUMENTOS DO CLIENTE COMO CONTEXTO (máx. 3)</label>
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
                    <FileText size={12} color="#6b6b68"/>
                    <span style={{ color:'#333' }}>{f.original_filename || f.filename}</span>
                    <span style={{ fontSize:11, color:'#6b6b68' }}>({f.file_type})</span>
                  </label>
                ))}
                {arquivosContexto.length > 0 && (
                  <p style={{ margin:'4px 0 0', fontSize:11, color:'#0d2340', fontWeight:600 }}>
                    ✅ {arquivosContexto.length} arquivo(s) serão enviados à IA como contexto
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
          <button onClick={gerar} disabled={gerando}
            style={{ background: gerando ? '#ccc' : 'linear-gradient(135deg,#0d2340,#1a3a5c)',
              color:'#fff', border:'none', borderRadius:10, padding:'14px',
              fontWeight:700, fontSize:15, cursor: gerando ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Sparkles size={18} />
            {gerando ? 'Pesquisando jurisprudência e redigindo...' : 'Gerar Peça com IA'}
          </button>

          {/* Banner de segurança jurídica */}
          <div style={{ background:'#fff8f1', border:'1.5px solid #fed7aa', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
            <p style={{ margin:'0 0 4px', fontWeight:700, color:'#c2410c' }}>⚠️ Segurança jurídica — leia antes de usar</p>
            <p style={{ margin:0, color:'#7c2d12', lineHeight:1.5 }}>
              A IA pesquisa jurisprudência real via busca web e cita apenas o que encontra. Onde não encontrar decisão verificada, inserirá <strong>[JURISPRUDÊNCIA PENDENTE]</strong> para você completar manualmente.
              <strong> Sempre revise as citações antes de protocolar.</strong>
            </p>
          </div>

          {gerando && (
            <div style={{ background:'#f0f7ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1e40af' }}>
              ⏳ Pesquisando jurisprudência real em tempo real e redigindo a peça. Isso pode levar 30–90 segundos...
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
            {/* Título editável */}
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
