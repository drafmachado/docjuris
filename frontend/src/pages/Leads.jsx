// Funil de Vendas — visão executiva (KPIs), quadro por etapa e painel do lead.
import { useState, useEffect, useMemo, useRef } from 'react';
import { Topbar, Btn, Modal, FormGrid, FormField } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import {
  Plus, Search, X, ChevronLeft, ChevronRight, Phone, Mail, Clock, TrendingUp,
  Target, CheckCircle2, DollarSign, MessageSquare, UserPlus, Trash2, Filter,
} from 'lucide-react';

const ETAPAS = [
  { id: 'contato',    label: 'Contato',    cor: '#6b7280', bg: '#f3f4f6' },
  { id: 'consulta',   label: 'Consulta',   cor: '#0c66e4', bg: '#e8f0fe' },
  { id: 'proposta',   label: 'Proposta',   cor: '#b45309', bg: '#fef3c7' },
  { id: 'contratado', label: 'Contratado', cor: '#1f845a', bg: '#dcfce7' },
  { id: 'perdido',    label: 'Perdido',    cor: '#c9372c', bg: '#fee2e2' },
];
const AREAS = {
  saude: 'Saúde', civel: 'Cível', consumidor: 'Consumidor', inventario: 'Inventário',
  familia: 'Família', trabalhista: 'Trabalhista', previdenciario: 'Previdenciário', outro: 'Outro',
};
const CORES_AREA = {
  saude: '#0891b2', civel: '#7c3aed', consumidor: '#ea580c', inventario: '#4d7c0f',
  familia: '#db2777', trabalhista: '#0284c7', previdenciario: '#65a30d', outro: '#6b7280',
};

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const iniciais = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
function diasDesde(d) {
  if (!d) return null;
  const ms = Date.now() - new Date(String(d).replace(' ', 'T') + 'Z').getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}
function fmtDataHora(d) {
  try { return new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}
const zap = t => `https://wa.me/${String(t || '').replace(/\D/g, '')}`;

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [modalNovo, setModalNovo] = useState(false);
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', area: 'outro', origem: 'whatsapp', etapa: 'contato', valor_estimado: '', observacoes: '' });
  const [leadAberto, setLeadAberto] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [novaAtividade, setNovaAtividade] = useState('');
  const [alturaQuadro, setAlturaQuadro] = useState('60vh');
  const quadroRef = useRef(null);

  const load = () => api.get('/leads').then(r => setLeads(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const medir = () => {
      if (!quadroRef.current) return;
      const topo = quadroRef.current.getBoundingClientRect().top;
      setAlturaQuadro(`${Math.max(300, window.innerHeight - topo - 14)}px`);
    };
    medir();
    const t = setTimeout(medir, 300);
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, [leads.length]);

  useEffect(() => {
    if (!leadAberto) { setDetalhe(null); return; }
    api.get(`/leads/${leadAberto}`).then(r => setDetalhe(r.data)).catch(() => toast.error('Erro ao abrir lead'));
  }, [leadAberto]);

  const filtrados = useMemo(() => leads.filter(l => {
    if (filtroArea && l.area !== filtroArea) return false;
    if (filtroOrigem && l.origem !== filtroOrigem) return false;
    if (!busca.trim()) return true;
    const t = busca.toLowerCase();
    return [l.nome, l.telefone, l.email, l.observacoes].some(x => String(x || '').toLowerCase().includes(t));
  }), [leads, busca, filtroArea, filtroOrigem]);

  // KPIs
  const kpis = useMemo(() => {
    const abertos = filtrados.filter(l => !['contratado', 'perdido'].includes(l.etapa));
    const contratados = filtrados.filter(l => l.etapa === 'contratado');
    const perdidos = filtrados.filter(l => l.etapa === 'perdido');
    const fechados = contratados.length + perdidos.length;
    const pipeline = abertos.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
    const ganho = contratados.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
    const conversao = fechados ? Math.round((contratados.length / fechados) * 100) : 0;
    const novos30 = filtrados.filter(l => diasDesde(l.created_at) !== null && diasDesde(l.created_at) <= 30).length;
    return { abertos: abertos.length, pipeline, ganho, conversao, novos30 };
  }, [filtrados]);

  async function moverEtapa(lead, dir) {
    const idx = ETAPAS.findIndex(e => e.id === lead.etapa);
    const nova = ETAPAS[idx + dir];
    if (!nova) return;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, etapa: nova.id } : l));
    try {
      await api.put(`/leads/${lead.id}`, { ...lead, etapa: nova.id });
      if (nova.id === 'contratado') toast('Lead contratado! Use "Converter em cliente" no painel.', { icon: '🎉', duration: 6000 });
    } catch { toast.error('Erro ao mover'); load(); }
  }

  async function criar() {
    if (!form.nome.trim()) return toast.error('Informe o nome');
    try {
      await api.post('/leads', { ...form, valor_estimado: form.valor_estimado ? Number(String(form.valor_estimado).replace(/\./g, '').replace(',', '.')) : null });
      toast.success('Lead criado');
      setModalNovo(false);
      setForm({ nome: '', telefone: '', email: '', area: 'outro', origem: 'whatsapp', etapa: 'contato', valor_estimado: '', observacoes: '' });
      load();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  }

  async function salvarDetalhe(campos) {
    try {
      await api.put(`/leads/${detalhe.id}`, { ...detalhe, ...campos });
      setDetalhe(d => ({ ...d, ...campos }));
      load();
      toast.success('Salvo');
    } catch { toast.error('Erro ao salvar'); }
  }

  async function addAtividade() {
    if (!novaAtividade.trim()) return;
    try {
      await api.post(`/leads/${detalhe.id}/atividades`, { tipo: 'nota', descricao: novaAtividade });
      setNovaAtividade('');
      api.get(`/leads/${detalhe.id}`).then(r => setDetalhe(r.data));
    } catch { toast.error('Erro'); }
  }

  async function converter() {
    if (!window.confirm(`Converter "${detalhe.nome}" em cliente?\n\nCria o cadastro e gera o link de envio de documentos.`)) return;
    try {
      const r = await api.post(`/leads/${detalhe.id}/converter`);
      toast.success('Convertido em cliente!', { duration: 7000 });
      if (r.data?.upload_link) navigator.clipboard?.writeText(r.data.upload_link).catch(() => {});
      setLeadAberto(null); load();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao converter'); }
  }

  async function excluir(lead, e) {
    e.stopPropagation();
    if (!window.confirm(`Excluir o lead "${lead.nome}"?`)) return;
    try { await api.delete(`/leads/${lead.id}`); setLeads(p => p.filter(x => x.id !== lead.id)); toast.success('Excluído'); }
    catch { toast.error('Erro'); }
  }

  const KPI = ({ icone, label, valor, sub, cor }) => (
    <div style={{ background: '#fff', borderRadius: 14, padding: '13px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      borderLeft: `3px solid ${cor}`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700,
        color: '#6b7280', letterSpacing: '0.06em', marginBottom: 4 }}>
        {icone} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1.1, fontFamily: "'Space Grotesk', sans-serif" }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: '#9a9a97', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <Topbar title="Funil de Vendas">
        <div style={{ position: 'relative', marginRight: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9a9a97' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar lead..."
            style={{ width: 180, padding: '8px 10px 8px 30px', fontSize: 13, border: '1px solid #d0cfc7', borderRadius: 9 }} />
        </div>
        <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
          style={{ width: 'auto', minWidth: 120, marginRight: 8, padding: '8px 10px', fontSize: 13, borderRadius: 9 }}>
          <option value="">Todas as áreas</option>
          {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Btn onClick={() => setModalNovo(true)}><Plus size={14} /> Novo Lead</Btn>
      </Topbar>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPI icone={<Target size={12} />} label="EM ABERTO" valor={kpis.abertos} sub="leads ativos no funil" cor="#0c66e4" />
        <KPI icone={<DollarSign size={12} />} label="PIPELINE" valor={brl(kpis.pipeline)} sub="valor em negociação" cor="#b45309" />
        <KPI icone={<CheckCircle2 size={12} />} label="CONVERSÃO" valor={`${kpis.conversao}%`} sub="contratados / fechados" cor="#1f845a" />
        <KPI icone={<TrendingUp size={12} />} label="GANHO" valor={brl(kpis.ganho)} sub="contratos fechados" cor="#1f845a" />
        <KPI icone={<UserPlus size={12} />} label="NOVOS (30d)" valor={kpis.novos30} sub="entradas recentes" cor="#7c3aed" />
      </div>

      {/* Quadro */}
      <div ref={quadroRef} className="funil-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto',
        height: alturaQuadro, alignItems: 'flex-start', paddingBottom: 6, maxWidth: '100%' }}>
        {ETAPAS.map((et, i) => {
          const itens = filtrados.filter(l => l.etapa === et.id);
          const valorEtapa = itens.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
          return (
            <div key={et.id} style={{ minWidth: 268, maxWidth: 290, background: '#f0efe8', borderRadius: 12,
              padding: '10px 8px', flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
              <div style={{ flexShrink: 0, padding: '0 6px 8px', borderBottom: `2px solid ${et.cor}33`, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 12.5, color: et.cor, letterSpacing: '0.03em' }}>{et.label}</span>
                  <span style={{ background: '#fff', borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 700, color: '#6b6b68' }}>{itens.length}</span>
                </div>
                {valorEtapa > 0 && <div style={{ fontSize: 10.5, color: '#6b6b68', marginTop: 2 }}>{brl(valorEtapa)}</div>}
              </div>

              <div className="coluna-scroll" style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
                {itens.map(l => {
                  const dias = diasDesde(l.updated_at);
                  const parado = dias !== null && dias >= 7 && !['contratado', 'perdido'].includes(l.etapa);
                  return (
                    <div key={l.id} onClick={() => setLeadAberto(l.id)} style={{ background: '#fff', borderRadius: 10,
                      padding: '11px 12px', marginBottom: 8, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      borderLeft: `3px solid ${CORES_AREA[l.area] || '#6b7280'}` }}>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: '#0f2035',
                          color: '#c5a859', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {iniciais(l.nome)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                            <span style={{ background: `${CORES_AREA[l.area]}18`, color: CORES_AREA[l.area],
                              borderRadius: 4, padding: '1px 7px', fontSize: 9.5, fontWeight: 700 }}>{AREAS[l.area] || 'Outro'}</span>
                            {l.origem === 'whatsapp' && <span style={{ background: '#dcfce7', color: '#1f845a', borderRadius: 4, padding: '1px 7px', fontSize: 9.5, fontWeight: 700 }}>WhatsApp</span>}
                            {l.origem === 'cliente-existente' && <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '1px 7px', fontSize: 9.5, fontWeight: 700 }}>Cliente atual</span>}
                          </div>
                        </div>
                      </div>

                      {l.valor_estimado > 0 && (
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1f845a', marginTop: 7 }}>{brl(l.valor_estimado)}</div>
                      )}
                      {l.observacoes && (
                        <div style={{ fontSize: 11, color: '#6b6b68', marginTop: 5, overflow: 'hidden',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                          {l.observacoes}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
                          color: parado ? '#c9372c' : '#9a9a97', fontWeight: parado ? 700 : 400 }}>
                          <Clock size={10} /> {dias === 0 ? 'hoje' : `${dias}d parado`}
                        </span>
                        <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                          {l.telefone && (
                            <a href={zap(l.telefone)} target="_blank" rel="noreferrer" title="Abrir no WhatsApp"
                              style={{ background: '#dcfce7', borderRadius: 6, padding: '3px 7px', display: 'flex' }}>
                              <MessageSquare size={11} color="#1f845a" />
                            </a>
                          )}
                          <button onClick={() => moverEtapa(l, -1)} disabled={i === 0}
                            style={{ background: i === 0 ? '#f5f5f0' : '#e8f0fe', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: i === 0 ? 'default' : 'pointer', display: 'flex' }}>
                            <ChevronLeft size={11} color={i === 0 ? '#ccc' : '#0c66e4'} />
                          </button>
                          <button onClick={() => moverEtapa(l, 1)} disabled={i === ETAPAS.length - 1}
                            style={{ background: i === ETAPAS.length - 1 ? '#f5f5f0' : '#dcfce7', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: i === ETAPAS.length - 1 ? 'default' : 'pointer', display: 'flex' }}>
                            <ChevronRight size={11} color={i === ETAPAS.length - 1 ? '#ccc' : '#1f845a'} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {itens.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: 11.5, color: '#9a9a97' }}>vazio</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Painel do lead */}
      {leadAberto && (
        <div onClick={() => setLeadAberto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,53,0.55)', zIndex: 200,
          display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fbfbf9', width: '100%', maxWidth: 520,
            height: '100%', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.2)' }}>
            {!detalhe && <p style={{ padding: '2rem', color: '#9a9a97' }}>Carregando...</p>}
            {detalhe && (<>
              <div style={{ background: '#0f2035', padding: '18px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: '#c5a859', color: '#0f2035',
                      fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {iniciais(detalhe.nome)}
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{detalhe.nome}</div>
                      <div style={{ fontSize: 12, color: '#d8d5c8' }}>
                        {AREAS[detalhe.area] || 'Outro'} · {detalhe.origem} · criado há {diasDesde(detalhe.created_at)}d
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setLeadAberto(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={19} /></button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  {ETAPAS.map(et => (
                    <span key={et.id} onClick={() => salvarDetalhe({ etapa: et.id })}
                      style={{ cursor: 'pointer', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700,
                        background: detalhe.etapa === et.id ? et.cor : 'rgba(255,255,255,0.12)',
                        color: detalhe.etapa === et.id ? '#fff' : '#d8d5c8' }}>
                      {et.label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ padding: '16px 22px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {detalhe.telefone && (
                    <a href={zap(detalhe.telefone)} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#1f845a',
                        borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                      <MessageSquare size={13} /> WhatsApp
                    </a>
                  )}
                  {detalhe.etapa !== 'contratado' && (
                    <button onClick={converter} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f2035',
                      color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      <UserPlus size={13} /> Converter em cliente
                    </button>
                  )}
                </div>

                <FormGrid cols={2}>
                  <FormField label="Telefone">
                    <input defaultValue={detalhe.telefone || ''} onBlur={e => e.target.value !== (detalhe.telefone || '') && salvarDetalhe({ telefone: e.target.value })} />
                  </FormField>
                  <FormField label="Email">
                    <input defaultValue={detalhe.email || ''} onBlur={e => e.target.value !== (detalhe.email || '') && salvarDetalhe({ email: e.target.value })} />
                  </FormField>
                  <FormField label="Área">
                    <select value={detalhe.area || 'outro'} onChange={e => salvarDetalhe({ area: e.target.value })}>
                      {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Valor estimado (R$)">
                    <input defaultValue={detalhe.valor_estimado || ''} inputMode="decimal"
                      onBlur={e => salvarDetalhe({ valor_estimado: e.target.value ? Number(String(e.target.value).replace(/\./g, '').replace(',', '.')) : null })} />
                  </FormField>
                  <FormField label="Anotações" col={2}>
                    <textarea defaultValue={detalhe.observacoes || ''} rows={4}
                      onBlur={e => e.target.value !== (detalhe.observacoes || '') && salvarDetalhe({ observacoes: e.target.value })} />
                  </FormField>
                </FormGrid>

                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2035', marginBottom: 8 }}>Histórico e atividades</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <input value={novaAtividade} onChange={e => setNovaAtividade(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addAtividade()} placeholder="Registrar contato, proposta, observação..."
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #d0cfc7', fontSize: 13 }} />
                    <button onClick={addAtividade} style={{ background: '#0f2035', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '0 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Registrar</button>
                  </div>
                  {(detalhe.atividades || []).length === 0 && <p style={{ fontSize: 12.5, color: '#9a9a97' }}>Nenhuma atividade ainda.</p>}
                  <div style={{ position: 'relative', paddingLeft: 14 }}>
                    {(detalhe.atividades || []).map((a, i) => (
                      <div key={a.id || i} style={{ position: 'relative', paddingBottom: 12 }}>
                        <span style={{ position: 'absolute', left: -14, top: 5, width: 8, height: 8, borderRadius: '50%',
                          background: a.tipo === 'conversao' ? '#1f845a' : a.tipo === 'whatsapp' ? '#25d366' : '#c5a859' }} />
                        {i < (detalhe.atividades.length - 1) && (
                          <span style={{ position: 'absolute', left: -11, top: 15, bottom: 0, width: 2, background: '#e5e3d8' }} />
                        )}
                        <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.45 }}>{a.descricao}</div>
                        <div style={{ fontSize: 10.5, color: '#9a9a97', marginTop: 2 }}>
                          {fmtDataHora(a.created_at)}{a.autor ? ` · ${a.autor}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Novo lead */}
      <Modal open={modalNovo} onClose={() => setModalNovo(false)} title="Novo Lead"
        footer={<><Btn variant="outline" onClick={() => setModalNovo(false)}>Cancelar</Btn><Btn onClick={criar}>Criar lead</Btn></>}>
        <FormGrid cols={2}>
          <FormField label="Nome *" col={2}><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} autoFocus /></FormField>
          <FormField label="Telefone"><input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="21999998888" /></FormField>
          <FormField label="Email"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></FormField>
          <FormField label="Área">
            <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
              {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="Valor estimado (R$)"><input value={form.valor_estimado} inputMode="decimal"
            onChange={e => setForm(f => ({ ...f, valor_estimado: e.target.value.replace(/[^0-9,]/g, '') }))} placeholder="3000" /></FormField>
          <FormField label="Anotações" col={2}><textarea rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></FormField>
        </FormGrid>
      </Modal>

      <style>{`
        .funil-scroll::-webkit-scrollbar { height: 11px; }
        .funil-scroll::-webkit-scrollbar-track { background: #e8e6dc; border-radius: 8px; }
        .funil-scroll::-webkit-scrollbar-thumb { background: #0f2035; border-radius: 8px; }
        .coluna-scroll::-webkit-scrollbar { width: 6px; }
        .coluna-scroll::-webkit-scrollbar-thumb { background: #c9c6b8; border-radius: 6px; }
      `}</style>
    </div>
  );
}
