import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Card, Btn, Table, Tr, Td, Badge, FormField, FormGrid, EmptyState } from '../components/UI.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import UploadLinkModal from '../components/UploadLinkModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, Trash2, Download, DollarSign, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusColor = s => s === 'enviado' ? 'green' : s === 'erro' ? 'red' : 'blue';
const fmt = d => { try { return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }); } catch { return d; } };

const inp = { width:'100%', boxSizing:'border-box', padding:'9px 12px', border:'1px solid #d0cfc7', borderRadius:8, fontSize:14 };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('docs');
  const [honorarios, setHonorarios] = useState([]);
  const [showHonModal, setShowHonModal] = useState(false);
  const [honForm, setHonForm] = useState({ descricao:'', valor_total:'', num_parcelas:1, vencimento:'' });
  const [showExcModal, setShowExcModal] = useState(false);
  const [excMotivo, setExcMotivo] = useState('');
  const [excConfirm, setExcConfirm] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [showUploadLink, setShowUploadLink] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try { const res = await api.get(`/clients/${id}`); setClient(res.data); setForm(res.data); }
    catch { toast.error('Erro ao carregar cliente'); navigate('/clients'); }
  };

  useEffect(() => {
    load();
    // Polling automático a cada 2 minutos — atualiza documentos assinados, etc.
    const interval = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [id]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try { await api.put(`/clients/${id}`, form); toast.success('Dados salvos!'); load(); }
    catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  // ✅ Download DOCX com autenticação via token
  const handleDownloadDocx = async (docId) => {
    try {
      const res = await api.get(`/documents/${docId}/download/docx`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `documento_${docId}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Erro ao baixar documento'); }
  };

  // ✅ Abrir PDF (gerado ou assinado) com autenticação via token
  // Carregar honorários
  const loadHonorarios = async () => {
    try { const r = await api.get(`/honorarios?client_id=${id}`); setHonorarios(r.data); } catch {}
  };
  useEffect(() => { if (tab === 'fin') loadHonorarios(); }, [tab, id]);

  const handleSaveHon = async () => {
    try {
      await api.post('/honorarios', { client_id: id, ...honForm, valor_total: parseFloat(honForm.valor_total) });
      toast.success('Honorário registrado!');
      setShowHonModal(false);
      setHonForm({ descricao:'', valor_total:'', num_parcelas:1, vencimento:'' });
      loadHonorarios();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  };

  const handleStatusHon = async (honId, status) => {
    await api.put(`/honorarios/${honId}/status`, { status });
    loadHonorarios();
  };

  const handleSolicitarExclusao = async () => {
    if (excConfirm !== client.nome) return toast.error('Nome do cliente não confere');
    try {
      await api.post('/exclusao', { tipo: 'cliente', referencia_id: id, motivo: excMotivo });
      toast.success('Solicitação enviada! Aguardando aprovação da administração.');
      setShowExcModal(false); setExcMotivo(''); setExcConfirm('');
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  };

  const handleViewPdf = async (docId, signed = false) => {
    try {
      const endpoint = signed
        ? `/documents/${docId}/download/signed`
        : `/documents/${docId}/download/pdf`;
      const res = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch { toast.error('PDF ainda não disponível'); }
  };

  const onDrop = useCallback(async accepted => {
    setUploading(true);
    const fd = new FormData();
    accepted.forEach(f => fd.append('files', f));
    try {
      await api.post(`/clients/${id}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Arquivo(s) enviado(s)!'); load();
    } catch { toast.error('Erro no upload'); }
    finally { setUploading(false); }
  }, [id]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  const handleDeleteFile = async fileId => {
    if (!confirm('Remover este arquivo?')) return;
    try { await api.delete(`/clients/${id}/files/${fileId}`); toast.success('Arquivo removido'); load(); }
    catch { toast.error('Erro ao remover'); }
  };

  const handleResend = async docId => {
    try { const r = await api.post(`/documents/${docId}/resend`); toast.success('Email reenviado!'); if (r.data.email_preview) window.open(r.data.email_preview); }
    catch { toast.error('Erro ao reenviar'); }
  };

  if (!client) return <div style={{ padding: '2rem', color: '#6b6b68' }}>Carregando...</div>;

  const initials = client.nome?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const tabs = [{ id: 'docs', label: 'Documentos' }, { id: 'data', label: 'Dados pessoais' }, { id: 'files', label: `Arquivos (${client.files?.length || 0})` }, { id: 'fin', label: `💰 Financeiro (${honorarios.length})` }];

  return (
    <div>
      <button onClick={() => navigate('/clients')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b68', fontSize: 13, marginBottom: '1rem' }}>
        <ArrowLeft size={14} /> Voltar
      </button>

      <Card style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: '#185fa5', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>{client.nome}</h2>
            <p style={{ fontSize: 13, color: '#6b6b68' }}>CPF: {client.cpf || '—'} · {[client.cidade, client.estado].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setShowUploadLink(true)}>🔗 Link de upload</Btn>
            <Btn onClick={() => setShowGenerate(true)}>+ Gerar Documento</Btn>
            <button onClick={() => setShowExcModal(true)}
              style={{ background:'none', border:'1px solid #fca5a5', borderRadius:8, padding:'6px 12px',
                color:'#dc2626', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <AlertTriangle size={13}/> Solicitar Exclusão
            </button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #1a3a5c' : '2px solid transparent',
            color: tab === t.id ? '#1a3a5c' : '#6b6b68', fontWeight: tab === t.id ? 500 : 400,
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'docs' && (
        <Card>
          <Table headers={['Documento', 'Gerado em', 'Por', 'Status', 'Ações']}>
            {(client.documents || []).map(d => (
              <Tr key={d.id}>
                <Td>{d.template_name}</Td>
                <Td muted>{fmt(d.created_at)}</Td>
                <Td muted>{d.generated_by_name || '—'}</Td>
                <Td><Badge color={statusColor(d.status)}>{d.status}</Badge></Td>
                <Td>
                  {d.pdf_filename && (
                    <button onClick={() => handleViewPdf(d.id, false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185fa5', fontSize: 12, marginRight: 8, textDecoration: 'underline' }}>PDF</button>
                  )}
                  {d.signed_pdf_filename && (
                    <button onClick={() => handleViewPdf(d.id, true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 12, marginRight: 8, textDecoration: 'underline', fontWeight: 600 }}>PDF Assinado</button>
                  )}
                  {d.docx_filename && (
                    <button onClick={() => handleDownloadDocx(d.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185fa5', fontSize: 12, marginRight: 8, textDecoration: 'underline' }}>
                      DOCX
                    </button>
                  )}
                  <button onClick={() => handleResend(d.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185fa5', fontSize: 12, textDecoration: 'underline' }}>
                    Reenviar
                  </button>
                </Td>
              </Tr>
            ))}
            {!client.documents?.length && (
              <tr><td colSpan={5}><EmptyState icon="📄" title="Nenhum documento ainda" subtitle="Clique em 'Gerar Documento'" /></td></tr>
            )}
          </Table>
        </Card>
      )}

      {tab === 'data' && (
        <Card style={{ padding: '1.25rem' }}>
          <FormGrid cols={2}>
            <FormField label="Nome completo" col={2}><input value={form.nome || ''} onChange={e => set('nome', e.target.value)} /></FormField>
            <FormField label="Nacionalidade"><input value={form.nacionalidade || ''} onChange={e => set('nacionalidade', e.target.value)} /></FormField>
            <FormField label="CPF"><input value={form.cpf || ''} onChange={e => set('cpf', e.target.value)} /></FormField>
            <FormField label="RG"><input value={form.rg || ''} onChange={e => set('rg', e.target.value)} /></FormField>
            <FormField label="Órgão expedidor"><input value={form.orgao_expedidor || ''} onChange={e => set('orgao_expedidor', e.target.value)} /></FormField>
            <FormField label="Endereço" col={2}><input value={form.endereco || ''} onChange={e => set('endereco', e.target.value)} /></FormField>
            <FormField label="Cidade"><input value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} /></FormField>
            <FormField label="Estado"><input value={form.estado || ''} onChange={e => set('estado', e.target.value)} /></FormField>
            <FormField label="Email"><input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></FormField>
            <FormField label="Telefone"><input value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} /></FormField>
            <FormField label="Observações" col={2}><textarea value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} /></FormField>
          </FormGrid>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={handleSave} loading={saving}>Salvar alterações</Btn>
          </div>
        </Card>
      )}

      {tab === 'files' && (
        <Card style={{ padding: '1.25rem' }}>
          <div {...getRootProps()} style={{
            border: `1.5px dashed ${isDragActive ? '#1a3a5c' : 'rgba(0,0,0,0.2)'}`,
            borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer',
            background: isDragActive ? '#f0f7ff' : '#fafaf8', marginBottom: '1rem',
          }}>
            <input {...getInputProps()} />
            <Upload size={22} color="#6b6b68" style={{ margin: '0 auto 8px', display: 'block' }} />
            <p style={{ fontSize: 13, color: '#6b6b68' }}>{uploading ? 'Enviando...' : 'Arraste ou clique para enviar arquivos'}</p>
            <p style={{ fontSize: 11, color: '#9a9a97', marginTop: 4 }}>RG, CPF, comprovante, procuração, etc.</p>
          </div>

          {(client.files || []).map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f5f5f0', borderRadius: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 13, flex: 1 }}>📄 {f.original_name}</span>
              <span style={{ fontSize: 11, color: '#9a9a97' }}>{fmt(f.uploaded_at)}</span>
              <a href={`/files/client_files/${f.filename}`} target="_blank" rel="noreferrer" style={{ color: '#185fa5' }}><Download size={14} /></a>
              <button onClick={() => handleDeleteFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d' }}><Trash2 size={14} /></button>
            </div>
          ))}
          {!client.files?.length && <EmptyState icon="📁" title="Nenhum arquivo" subtitle="Envie documentos do cliente acima" />}
        </Card>
      )}

      <UploadLinkModal
        open={showUploadLink}
        client={client}
        onClose={() => setShowUploadLink(false)}
      />
      <GenerateModal open={showGenerate} preselectedClient={client} onClose={() => setShowGenerate(false)} onSuccess={() => { setShowGenerate(false); load(); }} />
    </div>
  );
}
