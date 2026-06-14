// Documents page
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, Topbar, Btn, Table, Tr, Td, Badge, EmptyState } from '../components/UI.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = d => { try { return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; } };
const statusColor = s => s === 'enviado' ? 'green' : s === 'erro' ? 'red' : 'blue';

export function Documents() {
  const [docs, setDocs] = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get('/documents').then(r => setDocs(r.data)).catch(() => {});

  useEffect(() => {
    load();
    // Polling a cada 2 minutos — detecta documentos assinados automaticamente
    const interval = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleResend = async (docId, e) => {
    e.stopPropagation();
    try {
      const r = await api.post(`/documents/${docId}/resend`);
      toast.success('Email reenviado!');
      if (r.data.email_preview) window.open(r.data.email_preview);
      load();
    } catch { toast.error('Erro ao reenviar'); }
  };

  return (
    <div>
      <Topbar title="Documentos">
        <Btn onClick={() => setShowGenerate(true)}>+ Gerar Documento</Btn>
      </Topbar>
      <Card>
        <CardHeader title={`${docs.length} documento(s)`} />
        <Table headers={['Cliente', 'Documento', 'Gerado em', 'Por', 'Status', 'Ações']}>
          {docs.map(d => (
            <Tr key={d.id} onClick={() => navigate(`/clients/${d.client_id}`)}>
              <Td><span style={{ fontWeight: 500 }}>{d.client_name}</span></Td>
              <Td>{d.template_name}</Td>
              <Td muted>{fmt(d.created_at)}</Td>
              <Td muted>{d.generated_by_name || '—'}</Td>
              <Td><Badge color={statusColor(d.status)}>{d.status}</Badge></Td>
              <Td>
                {d.pdf_filename && <a href={`/files/pdfs/${d.pdf_filename}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#185fa5', fontSize: 12, marginRight: 8 }}>PDF</a>}
                <button onClick={e => handleResend(d.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185fa5', fontSize: 12, textDecoration: 'underline' }}>Reenviar</button>
              </Td>
            </Tr>
          ))}
          {docs.length === 0 && <tr><td colSpan={6}><EmptyState icon="📄" title="Nenhum documento gerado" /></td></tr>}
        </Table>
      </Card>
      <GenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} onSuccess={() => { setShowGenerate(false); load(); }} />
    </div>
  );
}

export default Documents;
