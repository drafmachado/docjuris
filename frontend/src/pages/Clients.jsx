import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Topbar, Btn, EmptyState } from '../components/UI.jsx';
import NewClientModal from '../components/NewClientModal.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Search, FileText, FolderOpen, FilePlus } from 'lucide-react';

const initials = nome => (nome || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const avatarColors = ['#1a3a5c', '#185fa5', '#8a6d1f', '#3b6d11', '#6b3a8a', '#a3582d'];
const colorFor = nome => avatarColors[(nome || '').length % avatarColors.length];

export default function Clients() {
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

      <Topbar title="Clientes">
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
