import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Plus, Phone, Mail, ChevronRight, UserCheck, Trash2, X, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ETAPAS = [
  { id: 'contato',    label: 'Contato',    cor: '#6b6b68', bg: '#f0f0ec' },
  { id: 'consulta',   label: 'Consulta',   cor: '#b45309', bg: '#fef3c7' },
  { id: 'proposta',   label: 'Proposta',   cor: '#1e40af', bg: '#dbeafe' },
  { id: 'contratado', label: 'Contratado', cor: '#166534', bg: '#dcfce7' },
  { id: 'perdido',    label: 'Perdido',    cor: '#991b1b', bg: '#fee2e2' },
];

const AREAS = [
  { id: 'medico',      label: 'Direito Médico' },
  { id: 'inventarios', label: 'Inventários' },
  { id: 'civel',       label: 'Cível' },
  { id: 'outro',       label: 'Outro' },
];

const ORIGENS = [
  { id: 'site',        label: 'Site' },
  { id: 'instagram',   label: 'Instagram' },
  { id: 'indicacao',   label: 'Indicação' },
  { id: 'whatsapp',    label: 'WhatsApp' },
  { id: 'linkedin',    label: 'LinkedIn' },
  { id: 'outro',       label: 'Outro' },
];

const BLANK = { nome:'', telefone:'', email:'', area:'medico', origem:'site', valor_estimado:'', observacoes:'' };

export default function Leads() {
  const [leads, setLeads]         = useState([]);
  const [filtro, setFiltro]       = useState('');
  const [modal, setModal]         = useState(null); // 'novo' | lead object
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);
  const [nota, setNota]           = useState('');
  const [atividades, setAtividades] = useState([]);
  const navigate = useNavigate();

  useEffect(() => { carregar(); }, [filtro]);

  async function carregar() {
    const params = filtro ? `?etapa=${filtro}` : '';
    const r = await api.get(`/leads${params}`);
    setLeads(r.data);
  }

  async function abrirLead(lead) {
    const r = await api.get(`/leads/${lead.id}`);
    setForm({ ...r.data, valor_estimado: r.data.valor_estimado || '' });
    setAtividades(r.data.atividades || []);
    setModal(r.data);
  }

  async function salvar() {
    setSaving(true);
    try {
      if (modal === 'novo') {
        await api.post('/leads', form);
        toast.success('Lead adicionado!');
      } else {
        await api.put(`/leads/${modal.id}`, form);
        toast.success('Atualizado!');
      }
      setModal(null); setForm(BLANK); carregar();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setSaving(false); }
  }

  async function moverEtapa(lead, etapa) {
    await api.put(`/leads/${lead.id}`, { ...lead, etapa });
    carregar();
  }

  async function addNota() {
    if (!nota.trim()) return;
    await api.post(`/leads/${modal.id}/atividades`, { tipo: 'nota', descricao: nota });
    setNota('');
    const r = await api.get(`/leads/${modal.id}`);
    setAtividades(r.data.atividades || []);
  }

  async function converter(lead) {
    if (!window.confirm(`Converter "${lead.nome}" em cliente?\n\nO sistema irá:\n✅ Criar o cliente no Veredo\n✅ Gerar link de documentos (30 dias)\n✅ Enviar WhatsApp de boas-vindas`)) return;
    try {
      const r = await api.post(`/leads/${lead.id}/converter`);
      if (r.data.uploadLink) {
        await navigator.clipboard.writeText(r.data.uploadLink).catch(()=>{});
        toast.success(`Cliente criado! Link de documentos gerado e copiado.`, { duration: 6000 });
      } else {
        toast.success('Cliente criado com sucesso!');
      }
      setModal(null); carregar();
      navigate(`/clients/${r.data.clienteId}`);
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao converter');
    }
  }

  async function excluir(lead) {
    if (!window.confirm(`Excluir lead "${lead.nome}"?`)) return;
    await api.delete(`/leads/${lead.id}`);
    setModal(null); carregar();
  }

  const etapa = (id) => ETAPAS.find(e => e.id === id) || ETAPAS[0];
  const contagens = ETAPAS.map(e => ({ ...e, n: leads.filter(l => l.etapa === e.id).length }));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0d2340', margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>CRM — Funil de Leads</h2>
          <p style={{ fontSize: 13, color: '#6b6b68', margin: '2px 0 0' }}>{leads.length} lead(s) encontrado(s)</p>
        </div>
        <button onClick={() => { setForm(BLANK); setModal('novo'); }}
          style={{ background: '#0d2340', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Novo Lead
        </button>
      </div>

      {/* Funil — contadores */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.2rem', overflowX: 'auto', paddingBottom: 4 }}>
        <button onClick={() => setFiltro('')}
          style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
            borderColor: filtro === '' ? '#0d2340' : '#d0cfc7',
            background: filtro === '' ? '#0d2340' : '#fff',
            color: filtro === '' ? '#fff' : '#333', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Todos ({leads.length})
        </button>
        {contagens.map(e => (
          <button key={e.id} onClick={() => setFiltro(e.id)}
            style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
              borderColor: filtro === e.id ? e.cor : '#d0cfc7',
              background: filtro === e.id ? e.bg : '#fff',
              color: e.cor, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: filtro === e.id ? 700 : 400 }}>
            {e.label} ({e.n})
          </button>
        ))}
      </div>

      {/* Lista */}
      {leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b6b68' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>👥</p>
          <p>Nenhum lead {filtro ? 'nesta etapa' : 'cadastrado'}.</p>
          <button onClick={() => { setForm(BLANK); setModal('novo'); }}
            style={{ marginTop: 12, background: '#c5a859', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}>
            + Adicionar primeiro lead
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leads.map(l => {
            const et = etapa(l.etapa);
            return (
              <div key={l.id} onClick={() => abrirLead(l)}
                style={{ background: '#fff', border: '1px solid #e5e2d6', borderRadius: 10,
                  padding: '12px 16px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 12 }}>
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0d2340',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#c5a859', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                  {l.nome.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0d2340', marginBottom: 2 }}>{l.nome}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {l.telefone && <span style={{ fontSize: 11, color: '#6b6b68', display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} />{l.telefone}</span>}
                    {l.email && <span style={{ fontSize: 11, color: '#6b6b68', display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} />{l.email}</span>}
                    <span style={{ fontSize: 11, color: '#6b6b68' }}>{AREAS.find(a=>a.id===l.area)?.label}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: et.bg, color: et.cor }}>{et.label}</span>
                  <ChevronRight size={16} color="#6b6b68" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 600, maxHeight: '92vh',
            borderRadius: '16px 16px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header modal */}
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #e5e2d6',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0d2340' }}>
                {modal === 'novo' ? 'Novo Lead' : form.nome}
              </h3>
              <button onClick={() => setModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#6b6b68" />
              </button>
            </div>

            {/* Corpo modal */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Nome completo *" value={form.nome}
                  onChange={e => setForm(p=>({...p, nome:e.target.value}))}
                  style={inp} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input placeholder="Telefone" value={form.telefone||''}
                    onChange={e => setForm(p=>({...p, telefone:e.target.value}))} style={inp} />
                  <input placeholder="E-mail" value={form.email||''}
                    onChange={e => setForm(p=>({...p, email:e.target.value}))} style={inp} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <select value={form.area||'outro'} onChange={e=>setForm(p=>({...p,area:e.target.value}))} style={inp}>
                    {AREAS.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                  <select value={form.origem||'outro'} onChange={e=>setForm(p=>({...p,origem:e.target.value}))} style={inp}>
                    {ORIGENS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                {modal !== 'novo' && (
                  <select value={form.etapa||'contato'} onChange={e=>setForm(p=>({...p,etapa:e.target.value}))} style={inp}>
                    {ETAPAS.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                )}
                <input placeholder="Valor estimado (R$)" type="number" value={form.valor_estimado||''}
                  onChange={e=>setForm(p=>({...p,valor_estimado:e.target.value}))} style={inp} />
                <textarea placeholder="Observações" rows={3} value={form.observacoes||''}
                  onChange={e=>setForm(p=>({...p,observacoes:e.target.value}))}
                  style={{...inp, resize:'vertical', fontFamily:'inherit'}} />
              </div>

              {/* Ações rápidas */}
              {modal !== 'novo' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {form.telefone && (
                    <a href={`https://wa.me/55${form.telefone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                        background:'#dcfce7', color:'#166534', borderRadius:8, fontSize:12,
                        fontWeight:600, textDecoration:'none' }}>
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  <button onClick={() => converter(modal)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                      background:'#0d2340', color:'#fff', border:'none', borderRadius:8,
                      fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    <UserCheck size={13} /> Converter em Cliente
                  </button>
                  <button onClick={() => excluir(modal)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                      background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:8,
                      fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              )}

              {/* Atividades */}
              {modal !== 'novo' && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#6b6b68', marginBottom: 8 }}>HISTÓRICO</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input placeholder="Adicionar nota..." value={nota}
                      onChange={e=>setNota(e.target.value)}
                      onKeyDown={e=>e.key==='Enter' && addNota()}
                      style={{...inp, flex:1}} />
                    <button onClick={addNota}
                      style={{ padding:'8px 14px', background:'#c5a859', color:'#fff',
                        border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:12 }}>
                      Add
                    </button>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {atividades.map(a => (
                      <div key={a.id} style={{ padding:'8px 12px', background:'#f8f7f3',
                        borderRadius:8, fontSize:13 }}>
                        <span style={{ color:'#0d2340' }}>{a.descricao}</span>
                        <span style={{ color:'#6b6b68', fontSize:11, marginLeft:8 }}>
                          {new Date(a.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 1.2rem', borderTop:'1px solid #e5e2d6',
              display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setModal(null)}
                style={{ padding:'10px 20px', borderRadius:8, border:'1px solid #d0cfc7',
                  background:'#fff', fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving}
                style={{ padding:'10px 24px', borderRadius:8, border:'none',
                  background: saving ? '#ccc' : '#0d2340', color:'#fff',
                  fontWeight:700, fontSize:14, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  border: '1px solid #d0cfc7', borderRadius: 8, fontSize: 14,
};
