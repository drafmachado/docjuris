import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, Topbar, Btn, Table, Tr, Td, Badge, EmptyState } from '../components/UI.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import { Users, FileText, FileStack, Send } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusColor = s => s === 'enviado' ? 'green' : s === 'erro' ? 'red' : 'blue';
const statusLabel = s => ({ enviado: 'Enviado', gerado: 'Gerado', erro: 'Erro' }[s] || s);

export default function Dashboard() {
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState({ clients: 0, docs: 0, templates: 0, sent: 0 });
  const [showGenerate, setShowGenerate] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [docsRes, clientsRes, templatesRes] = await Promise.all([
        api.get('/documents'),
        api.get('/clients'),
        api.get('/templates'),
      ]);
      setDocs(docsRes.data.slice(0, 8));
      setStats({
        clients: clientsRes.data.length,
        docs: docsRes.data.length,
        templates: templatesRes.data.length,
        sent: docsRes.data.filter(d => d.email_sent).length,
      });
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const fmt = dateStr => {
    try { return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR }); } catch { return dateStr; }
  };

  return (
    <div>
      <Topbar title="Dashboard">
        <Btn onClick={() => setShowGenerate(true)}>+ Gerar Documento</Btn>
      </Topbar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Clientes', value: stats.clients, icon: <Users size={15} />, sub: 'cadastrados' },
          { label: 'Documentos', value: stats.docs, icon: <FileText size={15} />, sub: 'gerados no total' },
          { label: 'Templates', value: stats.templates, icon: <FileStack size={15} />, sub: 'disponíveis' },
          { label: 'Enviados', value: stats.sent, icon: <Send size={15} />, sub: 'por email' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b6b68', marginBottom: 6 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9a9a97', marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="Documentos recentes" action={<Btn variant="outline" size="sm" onClick={() => navigate('/documents')}>Ver todos</Btn>} />
        <Table headers={['Cliente', 'Documento', 'Data', 'Status', '']}>
          {docs.map(d => (
            <Tr key={d.id} onClick={() => navigate(`/clients/${d.client_id}`)}>
              <Td>{d.client_name}</Td>
              <Td>{d.template_name}</Td>
              <Td muted>{fmt(d.created_at)}</Td>
              <Td><Badge color={statusColor(d.status)}>{statusLabel(d.status)}</Badge></Td>
              <Td>
                {d.pdf_filename && <a href={`/files/pdfs/${d.pdf_filename}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#185fa5', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>PDF</a>}
              </Td>
            </Tr>
          ))}
          {docs.length === 0 && <tr><td colSpan={5}><EmptyState icon="📄" title="Nenhum documento gerado ainda" subtitle="Clique em 'Gerar Documento' para começar" /></td></tr>}
        </Table>
      </Card>

      <GenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} onSuccess={() => { setShowGenerate(false); load(); }} />
    </div>
  );
}
