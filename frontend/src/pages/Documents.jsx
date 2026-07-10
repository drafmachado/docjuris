// Documents page
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, Topbar, Btn, Table, Tr, Td, Badge, EmptyState } from '../components/UI.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import { abrirArquivoAutenticado } from '../utils/download.js';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = d => { try { return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; } };

// Estado real da assinatura, baseado nos dados do Autentique
function assinaturaInfo(d) {
  if (d.status === 'assinado' || d.signed_pdf_filename) {
    return { label: '✓ Assinado', color: 'green', enviado: true };
  }
  if (d.zapsign_doc_token) {
    return { label: 'Aguardando assinatura', color: 'blue', enviado: true };
  }
  return { label: 'Não enviado', color: 'red', enviado: false };
}

export function Documents() {
  const [docs, setDocs] = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [enviando, setEnviando] = useState(null); // id do doc sendo enviado
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
      await api.post(`/documents/${docId}/resend`);
      toast.success('Email com o PDF reenviado ao cliente!');
      load();
    } catch(err) {
      toast.error(err.response?.data?.error || 'Erro ao reenviar');
    }
  };

  const handleSendSignature = async (docId, e) => {
    e.stopPropagation();
    setEnviando(docId);
    const toastId = toast.loading('Enviando para o Autentique...');
    try {
      await api.post(`/documents/${docId}/send-signature`);
      toast.success('Enviado! O cliente receberá o email de assinatura do Autentique.', { id: toastId });
      load();
    } catch(err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar para assinatura', { id: toastId });
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div>
      <Topbar title="Documentos">
        <Btn onClick={() => setShowGenerate(true)}>+ Gerar Documento</Btn>
      </Topbar>
      <Card>
        <CardHeader title={`${docs.length} documento(s)`} />
        <Table headers={['Cliente', 'Documento', 'Gerado em', 'Assinatura (Autentique)', 'Ações']}>
          {docs.map(d => {
            const assin = assinaturaInfo(d);
            return (
              <Tr key={d.id} onClick={() => d.client_id && navigate(`/clients/${d.client_id}`)}>
                <Td><span style={{ fontWeight: 500 }}>{d.client_name}</span></Td>
                <Td>{d.template_name}</Td>
                <Td muted>{fmt(d.created_at)}</Td>
                <Td><Badge color={assin.color}>{assin.label}</Badge></Td>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {!assin.enviado && (
                      <button
                        onClick={e => handleSendSignature(d.id, e)}
                        disabled={enviando === d.id}
                        style={{ background: '#0d2340', color: '#fff', border: 'none',
                          borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600 }}>
                        {enviando === d.id ? 'Enviando...' : '✍️ Enviar p/ assinatura'}
                      </button>
                    )}
                    {d.pdf_filename && (
                      <button onClick={e => { e.stopPropagation(); abrirArquivoAutenticado(`/files/pdfs/${d.pdf_filename}`); }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#185fa5', fontSize:12, textDecoration:'underline', padding:0 }}>PDF</button>
                    )}
                    <button onClick={e => handleResend(d.id, e)}
                      title="Reenvia o PDF por email comum (não é o pedido de assinatura)"
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: '#185fa5', fontSize: 12, textDecoration: 'underline' }}>
                      Reenviar email
                    </button>
                  </div>
                </Td>
              </Tr>
            );
          })}
          {docs.length === 0 && <tr><td colSpan={5}><EmptyState icon="📄" title="Nenhum documento gerado" /></td></tr>}
        </Table>
      </Card>
      <GenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} onSuccess={() => { setShowGenerate(false); load(); }} />
    </div>
  );
}

export default Documents;
