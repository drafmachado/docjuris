import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Card, Btn, Table, Tr, Td, Badge, FormField, FormGrid, EmptyState } from '../components/UI.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import UploadLinkModal from '../components/UploadLinkModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, Trash2, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusColor = s => s === 'enviado' ? 'green' : s === 'erro' ? 'red' : 'blue';
const fmt = d => { try { return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }); } catch { return d; } };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('docs');
  const [showGenerate, setShowGenerate] = useState(false);
  const [showUploadLink, setShowUploadLink] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try { const res = await api.get(`/clients/${id}`); setClient(res.data); setForm(res.data); }
    catch { toast.error('Erro ao carregar cliente'); navigate('/clients'); }
  };

  useEffect(() => { load(); }, [id]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try { await api.put(`/clients/${id}`, form); toast.success('Dados salvos!'); load(); }
    catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
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

  const tabs = [{ id: 'docs', label: 'Documentos' }, { id: 'data', label: 'Dados pessoais'
