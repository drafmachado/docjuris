import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Topbar, Btn, EmptyState } from '../components/UI.jsx';
import NewClientModal from '../components/NewClientModal.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Search, FileText, FolderOpen, FilePlus, Smartphone, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api.js';

const initials = nome => (nome || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const avatarColors = ['#1a3a5c', '#185fa5', '#8a6d1f', '#3b6d11', '#6b3a8a', '#a3582d'];
const colorFor = nome => avatarColors[(nome || '').length % avatarColors.length];

export default function Clients() {
  const [modalTel, setModalTel] = useState(false);
  const [busca, setBusca] = useState(null);          // { sugestoes, contatos_consultados }
  const [selTel, setSelTel] = useState({});          // client_id -> telefone
  const [aplicandoTel, setAplicandoTel] = useState(false);
  const [modoBusca, setModoBusca] = useState('faltantes');

  async function abrirBuscaTelefones() {
    setModalTel(true); setBusca(null); setSelTel({});
    try {
      const r = await api.get(`/clients/telefones/sugestoes?modo=faltantes`, { timeout: 90000 });
      setBusca(r.data);
      const pre = {};
      for (const s of r.data.sugestoes) {
        const top = s.candidatos[0];
        if (top && top.score >= 75) pre[s.client_id] = top.numero;
      }
      setSelTel(pre);
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao consultar o WhatsApp'); setModalTel(false); }
  }

  async function recarregarBusca(modo) {
    setModoBusca(modo); setBusca(null); setSelTel({});
    try {
      const r = await api.get(`/clients/telefones/sugestoes?modo=${modo}`, { timeout: 90000 });
      setBusca(r.data);
      const pre = {};
      for (const s of r.data.sugestoes) {
        const top = s.candidatos[0];
        if (top && top.score >= 75 && !s.telefone_atual) pre[s.client_id] = top.numero;
      }
      setSelTel(pre);
    } catch(e) { toast.error('Erro ao consultar'); }
  }

  async function aplicarTelefones() {
    const itens = Object.entries(selTel).filter(([, tel]) => tel).map(([id, tel]) => ({ client_id: Number(id), telefone: tel }));
    if (!itens.length) return toast.error('Marque ao menos um telefone');
    if (!window.confirm(`Gravar ${itens.length} telefone(s) na ficha dos clientes?`)) return;
    setAplicandoTel(true);
    try {
      const r = await api.post('/clients/telefones/aplicar', { itens });
      toast.success(`${r.data.atualizados} telefone(s) atualizado(s)`);
      setModalTel(false);
      window.location.reload();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setAplicandoTel(false); }
  }

  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [generateFor, setGenerateFor] = useState(null);
  const navigate = useNavigate();

  const load = async (q = '') => {
    try { const res = await api.get('/clients', { params: { search: q } }); setClients(res.data); }
    catch { toast.error('Erro ao carregar clientes'); }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = e => { setSearch(e.target.value); load(e.target.value); };

  return (
    <div>
      <style>{`
        .clientRow { transition: background .15s, border-color .15s; }
        .clientRow:hover { background: #fafaf8; border-color: rgba(26,58,92,.2) !important; }
        .clientAction { opacity: .7; transition: opacity .15s; }
        .clientRow:hover .clientAction { opacity: 1; }
      `}</style>

      {modalTel && (
        <div onClick={() => setModalTel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,53,0.6)',
          zIndex: 250, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fbfbf9', borderRadius: 16, width: '100%',
            maxWidth: 900, maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#0f2035', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fff' }}>Buscar telefones no WhatsApp</div>
                {busca && (
                  <div style={{ fontSize: 12, color: '#d8d5c8', marginTop: 2 }}>
                    {busca.contatos_consultados} contatos consultados nas linhas conectadas · {busca.sugestoes.length} cliente(s) com sugestão
                  </div>
                )}
              </div>
              <button onClick={() => setModalTel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={19} /></button>
            </div>

            <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
              {!busca && <p style={{ color: '#6b6b68', fontSize: 13, textAlign: 'center', padding: '2rem 0' }}>
                Consultando os contatos das linhas de WhatsApp...</p>}
              {busca && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => recarregarBusca('faltantes')}
                      style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: 'none', background: modoBusca === 'faltantes' ? '#0f2035' : '#e8e6dc',
                        color: modoBusca === 'faltantes' ? '#fff' : '#0f2035' }}>
                      Só quem está sem telefone
                    </button>
                    <button onClick={() => recarregarBusca('todos')}
                      style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: 'none', background: modoBusca === 'todos' ? '#0f2035' : '#e8e6dc',
                        color: modoBusca === 'todos' ? '#fff' : '#0f2035' }}>
                      Todos os clientes (conferir/corrigir)
                    </button>
                  </div>
                  {busca.sugestoes.length === 0 && (
                    <p style={{ fontSize: 13, color: '#6b6b68' }}>Nenhuma correspondência encontrada nos contatos do WhatsApp.</p>
                  )}
                  {busca.sugestoes.map(s => (
                    <div key={s.client_id} style={{ background: selTel[s.client_id] ? '#f4f8f0' : '#fff', borderRadius: 12,
                      padding: '12px 16px', marginBottom: 9, border: `1px solid ${selTel[s.client_id] ? '#c5ddb0' : '#eceade'}` }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f2035' }}>{s.nome}</div>
                      <div style={{ fontSize: 11.5, color: s.telefone_atual ? '#6b6b68' : '#b45309', marginBottom: 8 }}>
                        {s.telefone_atual ? `telefone atual: ${s.telefone_atual}` : 'sem telefone cadastrado'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {s.candidatos.map((ct, i) => {
                          const ativo = selTel[s.client_id] === ct.numero;
                          return (
                            <span key={i} onClick={() => setSelTel(p => ({ ...p, [s.client_id]: ativo ? null : ct.numero }))}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                                background: ativo ? '#eaf3de' : '#fff', border: `1.5px solid ${ativo ? '#3b6d11' : '#e5e3d8'}`,
                                borderRadius: 20, padding: '5px 13px', fontSize: 12 }}>
                              {ativo ? '✓ ' : ''}<b style={{ color: '#0f2035' }}>{ct.nome}</b>
                              <span style={{ color: '#3b6d11' }}>{ct.numero}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: ct.score >= 75 ? '#3b6d11' : '#b45309' }}>
                                {ct.score >= 75 ? 'alta' : 'baixa'} {ct.score}%
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={{ padding: '12px 22px', borderTop: '1px solid #eceade', background: '#fff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#6b6b68' }}>
                <b style={{ color: '#0f2035' }}>{Object.values(selTel).filter(Boolean).length}</b> telefone(s) marcado(s)
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalTel(false)} style={{ padding: '9px 18px', background: '#fff', color: '#0f2035',
                  border: '1.5px solid #d0cfc7', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={aplicarTelefones} disabled={aplicandoTel || !busca}
                  style={{ padding: '9px 20px', background: '#0f2035', color: '#fff', border: 'none',
                    borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {aplicandoTel ? 'Gravando...' : 'Gravar telefones'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Topbar title="Clientes">
        <Btn variant="outline" onClick={abrirBuscaTelefones} style={{ marginRight: 8 }}><Smartphone size={14} /> Buscar telefones no WhatsApp</Btn>
        <Btn onClick={() => setShowNew(true)}>+ Novo Cliente</Btn>
      </Topbar>

      {/* Barra de busca */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: '#0f2035' }}>
          {clients.length} cliente{clients.length !== 1 ? 's' : ''}
        </span>
        <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
          <input value={search} onChange={handleSearch} placeholder="Buscar por nome, CPF, email..."
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '10px 12px 10px 36px',
              border: '1px solid rgba(0,0,0,.1)', borderRadius: 12, background: '#fbfbf9' }} />
        </div>
      </div>

      {/* Lista de clientes em cards */}
      {clients.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16, padding: '1rem' }}>
          <EmptyState icon="👤" title="Nenhum cliente cadastrado" subtitle="Clique em 'Novo Cliente' para adicionar" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clients.map(c => (
            <div key={c.id} className="clientRow"
              onClick={() => navigate(`/clients/${c.id}`)}
              style={{ background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14,
                padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Avatar */}
              <div style={{ width: 44, height: 44, borderRadius: 13, background: colorFor(c.nome),
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 15, fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0 }}>
                {initials(c.nome)}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: '#0f2035', marginBottom: 2 }}>{c.nome}</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: '#999' }}>
                  {c.cpf && <span>CPF {c.cpf}</span>}
                  {(c.cidade || c.estado) && <span>{[c.cidade, c.estado].filter(Boolean).join(', ')}</span>}
                  {c.email && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{c.email}</span>}
                </div>
              </div>
              {/* Docs badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#185fa5',
                background: 'rgba(24,95,165,.08)', padding: '5px 11px', borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>
                <FileText size={13} /> {c.doc_count || 0}
              </div>
              {/* Ações */}
              <div className="clientAction" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); navigate(`/clients/${c.id}`); }}
                  title="Ver pasta"
                  style={{ background: '#f0f0ec', border: 'none', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#0f2035' }}>
                  <FolderOpen size={14} />
                </button>
                <button onClick={e => { e.stopPropagation(); setGenerateFor(c); }}
                  title="Gerar documento"
                  style={{ background: '#0f2035', border: 'none', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#fff' }}>
                  <FilePlus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewClientModal open={showNew} onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); load(); }} />
      <GenerateModal open={!!generateFor} preselectedClient={generateFor} onClose={() => setGenerateFor(null)} onSuccess={() => { setGenerateFor(null); load(); }} />
    </div>
  );
}

