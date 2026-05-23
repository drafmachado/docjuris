import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, Topbar, Btn, Table, Tr, Td, Badge, EmptyState } from '../components/UI.jsx';
import NewClientModal from '../components/NewClientModal.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';

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
      <Topbar title="Clientes">
        <Btn onClick={() => setShowNew(true)}>+ Novo Cliente</Btn>
      </Topbar>

      <Card>
        <CardHeader
          title={`${clients.length} cliente(s)`}
          action={<input value={search} onChange={handleSearch} placeholder="Buscar por nome, CPF..." style={{ width: 220, fontSize: 13, padding: '6px 10px' }} />}
        />
        <Table headers={['Nome', 'CPF', 'Cidade', 'Email', 'Docs', 'Ações']}>
          {clients.map(c => (
            <Tr key={c.id}>
              <Td><span style={{ fontWeight: 500, cursor: 'pointer', color: '#185fa5' }} onClick={() => navigate(`/clients/${c.id}`)}>{c.nome}</span></Td>
              <Td muted>{c.cpf || '—'}</Td>
              <Td muted>{[c.cidade, c.estado].filter(Boolean).join(', ') || '—'}</Td>
              <Td muted>{c.email || '—'}</Td>
              <Td><Badge color="blue">{c.doc_count || 0}</Badge></Td>
              <Td>
                <button onClick={() => navigate(`/clients/${c.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185fa5', fontSize: 12, textDecoration: 'underline', marginRight: 8 }}>
                  Ver pasta
                </button>
                <button onClick={() => setGenerateFor(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185fa5', fontSize: 12, textDecoration: 'underline' }}>
                  Gerar doc
                </button>
              </Td>
            </Tr>
          ))}
          {clients.length === 0 && <tr><td colSpan={6}><EmptyState icon="👤" title="Nenhum cliente cadastrado" subtitle="Clique em 'Novo Cliente' para adicionar" /></td></tr>}
        </Table>
      </Card>

      <NewClientModal open={showNew} onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); load(); }} />
      <GenerateModal open={!!generateFor} preselectedClient={generateFor} onClose={() => setGenerateFor(null)} onSuccess={() => { setGenerateFor(null); load(); }} />
    </div>
  );
}
