import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, Topbar, Btn, Modal, FormField, FormGrid, SectionTitle, Badge, EmptyState } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { FileText, Trash2, RotateCcw, Upload } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('contrato');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const load = () => api.get('/templates').then(r => setTemplates(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    maxFiles: 1,
    onDrop: f => setFile(f[0]),
  });

  const handleSave = async () => {
    if (!name || !file) { toast.error('Nome e arquivo são obrigatórios'); return; }
    setSaving(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name);
    fd.append('type', type);
    try {
      await api.post('/templates', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Template adicionado! A IA está analisando os campos...');
      setShowNew(false); setFile(null); setName(''); setType('contrato');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!confirm('Remover este template?')) return;
    try { await api.delete(`/templates/${id}`); toast.success('Template removido'); load(); }
    catch { toast.error('Erro'); }
  };

  const handleReanalyze = async id => {
    try {
      toast.loading('Reanalisando com IA...');
      await api.post(`/templates/${id}/reanalyze`);
      toast.dismiss(); toast.success('Campos reanalisados!'); load();
    } catch { toast.dismiss(); toast.error('Erro na análise'); }
  };

  const typeLabels = { contrato: 'Contrato', procuracao: 'Procuração', declaracao: 'Declaração', peticao: 'Petição', outro: 'Outro' };

  return (
    <div>
      <Topbar title="Templates">
        {isAdmin && <Btn onClick={() => setShowNew(true)}><Upload size={14} /> Adicionar template</Btn>}
      </Topbar>

      <div style={{ background: '#f0f7ff', border: '0.5px solid #b5d4f4', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 13, color: '#185fa5' }}>
        💡 Prepare seus templates .docx com campos como <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>{'{{NOME_CLIENTE}}'}</code>, <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>{'{{Valor}}'}</code> etc. A IA classifica automaticamente quais são dados do cliente e quais precisam ser preenchidos manualmente.
      </div>

      {templates.length === 0 ? (
        <Card style={{ padding: '3rem' }}><EmptyState icon="📋" title="Nenhum template cadastrado" subtitle="Adicione seu primeiro template .docx" /></Card>
      ) : templates.map(t => (
        <Card key={t.id} style={{ padding: '1rem', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={20} color="#185fa5" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h4 style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</h4>
              <Badge color="blue">{typeLabels[t.type] || t.type}</Badge>
            </div>
            <p style={{ fontSize: 12, color: '#6b6b68', marginBottom: 6 }}>{t.original_name}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(t.auto_fields || []).map(f => <span key={f} style={{ fontSize: 10, padding: '2px 6px', background: '#e8f0fe', color: '#185fa5', borderRadius: 10, border: '0.5px solid #b5d4f4' }}>🤖 {f}</span>)}
              {(t.manual_fields || []).map(f => <span key={f.key} style={{ fontSize: 10, padding: '2px 6px', background: '#fffbf0', color: '#854f0b', borderRadius: 10, border: '0.5px solid #fac775' }}>✏️ {f.label}</span>)}
            </div>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="outline" size="sm" onClick={() => handleReanalyze(t.id)} title="Reanalisar campos"><RotateCcw size={13} /></Btn>
              <Btn variant="danger" size="sm" onClick={() => handleDelete(t.id)}><Trash2 size={13} /></Btn>
            </div>
          )}
        </Card>
      ))}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Adicionar template"
        footer={<><Btn variant="outline" onClick={() => setShowNew(false)}>Cancelar</Btn><Btn onClick={handleSave} loading={saving}>Salvar template</Btn></>}
      >
        <FormGrid cols={2}>
          <FormField label="Nome do template" col={2}><input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Contrato de Honorários Cível" /></FormField>
          <FormField label="Tipo" col={2}>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="contrato">Contrato</option>
              <option value="procuracao">Procuração</option>
              <option value="declaracao">Declaração</option>
              <option value="peticao">Petição</option>
              <option value="outro">Outro</option>
            </select>
          </FormField>
        </FormGrid>

        <div {...getRootProps()} style={{ border: '1.5px dashed rgba(0,0,0,0.2)', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: '#fafaf8', margin: '0.75rem 0' }}>
          <input {...getInputProps()} />
          <Upload size={22} color="#6b6b68" style={{ margin: '0 auto 8px', display: 'block' }} />
          {file ? <p style={{ fontSize: 13, color: '#3b6d11' }}>✓ {file.name}</p> : <><p style={{ fontSize: 13, color: '#6b6b68' }}>Arraste ou clique para selecionar o .docx</p><p style={{ fontSize: 11, color: '#9a9a97', marginTop: 4 }}>Somente arquivos .docx</p></>}
        </div>

        <SectionTitle>Como preparar o template</SectionTitle>
        <div style={{ fontSize: 12, color: '#6b6b68', lineHeight: 1.7 }}>
          Use <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: 3 }}>{'{{NOME_CAMPO}}'}</code> no seu .docx para marcar onde os dados serão inseridos.
          <br />Exemplos: <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: 3 }}>{'{{NOME_CLIENTE}}'}</code>, <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: 3 }}>{'{{CPF}}'}</code>, <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: 3 }}>{'{{Valor}}'}</code>, <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: 3 }}>{'{{Data}}'}</code>
          <br />A IA detectará automaticamente quais campos são dados do cliente e quais precisam ser preenchidos manualmente.
        </div>
      </Modal>
    </div>
  );
}
