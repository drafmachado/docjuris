import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Modal, Btn, FormField, FormGrid, SectionTitle } from './UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Upload, CheckCircle, Sparkles } from 'lucide-react';

export default function NewClientModal({ open, onClose, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [form, setForm] = useState({ nome: '', nacionalidade: '', cpf: '', rg: '', orgao_expedidor: '', endereco: '', cidade: '', estado: '', email: '', telefone: '', observacoes: '' });
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const onDrop = useCallback(accepted => {
    setFiles(accepted);
    setExtracted(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'application/pdf': [] },
    multiple: true,
  });

  const handleExtract = async () => {
    if (files.length === 0) { toast.error('Adicione pelo menos um arquivo'); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const res = await api.post('/clients/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = res.data.data;
      setExtracted(data);
      setForm({
        nome: data.nome || '',
        nacionalidade: data.nacionalidade || '',
        cpf: data.cpf || '',
        rg: data.rg || '',
        orgao_expedidor: data.orgao_expedidor || '',
        endereco: data.endereco || '',
        cidade: data.cidade || '',
        estado: data.estado || '',
        email: data.email || '',
        telefone: data.telefone || '',
        observacoes: data.observacoes || '',
      });
      toast.success('Dados extraídos com sucesso!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro na extração');
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!form.nome) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      await api.post('/clients', form);
      toast.success('Cliente cadastrado!');
      onSuccess?.();
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFiles([]); setExtracted(null); setSaving(false); setExtracting(false);
    setForm({ nome: '', nacionalidade: '', cpf: '', rg: '', orgao_expedidor: '', endereco: '', cidade: '', estado: '', email: '', telefone: '', observacoes: '' });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo cliente"
      footer={<><Btn variant="outline" onClick={handleClose}>Cancelar</Btn><Btn onClick={handleSave} loading={saving}>Cadastrar cliente</Btn></>}
    >
      <div {...getRootProps()} style={{
        border: `1.5px dashed ${isDragActive ? '#1a3a5c' : 'rgba(0,0,0,0.2)'}`,
        borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer',
        background: isDragActive ? '#f0f7ff' : '#fafaf8', marginBottom: '0.75rem',
      }}>
        <input {...getInputProps()} />
        <Upload size={24} color="#6b6b68" style={{ margin: '0 auto 8px', display: 'block' }} />
        <p style={{ fontSize: 13, color: '#6b6b68' }}>{isDragActive ? 'Solte os arquivos aqui' : 'Arraste ou clique para enviar documentos do cliente'}</p>
        <p style={{ fontSize: 11, color: '#9a9a97', marginTop: 4 }}>RG, CPF, comprovante de residência (imagem ou PDF)</p>
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f5f5f0', borderRadius: 6, marginBottom: 4, fontSize: 12, color: '#6b6b68' }}>
              📄 {f.name} <span style={{ marginLeft: 'auto' }}>{(f.size / 1024).toFixed(0)} KB</span>
            </div>
          ))}
          <Btn onClick={handleExtract} loading={extracting} style={{ marginTop: 8 }}>
            <Sparkles size={14} /> {extracting ? 'Extraindo dados...' : 'Extrair dados com IA'}
          </Btn>
        </div>
      )}

      {extracted && (
        <div style={{ background: '#f0f7ff', border: '0.5px solid #b5d4f4', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} color="#185fa5" />
          <span style={{ fontSize: 12, color: '#185fa5' }}>Dados extraídos — confira e ajuste abaixo se necessário</span>
          {extracted.confianca && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b6b68' }}>Confiança: {extracted.confianca}</span>}
        </div>
      )}

      <SectionTitle>Dados pessoais</SectionTitle>
      <FormGrid cols={2}>
        <FormField label="Nome completo *" col={2}><input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" /></FormField>
        <FormField label="Nacionalidade"><input value={form.nacionalidade} onChange={e => set('nacionalidade', e.target.value)} placeholder="Brasileiro(a)" /></FormField>
        <FormField label="CPF"><input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" /></FormField>
        <FormField label="RG"><input value={form.rg} onChange={e => set('rg', e.target.value)} placeholder="00.000.000-0" /></FormField>
        <FormField label="Órgão expedidor"><input value={form.orgao_expedidor} onChange={e => set('orgao_expedidor', e.target.value)} placeholder="SSP-RJ" /></FormField>
        <FormField label="Endereço" col={2}><input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro" /></FormField>
        <FormField label="Cidade"><input value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Rio de Janeiro" /></FormField>
        <FormField label="Estado"><input value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="RJ" /></FormField>
        <FormField label="Email"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="cliente@email.com" /></FormField>
        <FormField label="Telefone"><input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(21) 99999-9999" /></FormField>
        <FormField label="Observações" col={2}><textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Observações sobre o cliente..." /></FormField>
      </FormGrid>
    </Modal>
  );
}
