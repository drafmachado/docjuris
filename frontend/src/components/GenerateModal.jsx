import { useState, useEffect, useRef } from 'react';
import { Modal, Btn, SectionTitle, FormField, FormGrid, Badge } from './UI.jsx';
import api from '../utils/api.js';
import { abrirArquivoAutenticado } from '../utils/download.js';
import SearchableSelect from './SearchableSelect.jsx';
import toast from 'react-hot-toast';
import { FileText, CheckCircle, Loader } from 'lucide-react';

export default function GenerateModal({ open, onClose, preselectedClient, onSuccess }) {
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [manualValues, setManualValues] = useState({});
  const [sendEmail, setSendEmail] = useState(true);
  const [emailTo, setEmailTo] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'generating' | 'done'
  const [result, setResult] = useState(null);
  const [stepProgress, setStepProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false); // useRef é síncrono — protege contra duplo clique

  useEffect(() => {
    if (!open) return;
    setStep('form'); setResult(null); setStepProgress(0); setManualValues({}); setIsSubmitting(false); submittingRef.current = false;
    api.get('/clients').then(r => setClients(r.data));
    api.get('/templates').then(r => setTemplates(r.data));
  }, [open]);

  useEffect(() => {
    if (preselectedClient) {
      setClientId(String(preselectedClient.id));
      setEmailTo(preselectedClient.email || '');
    }
  }, [preselectedClient]);

  useEffect(() => {
    if (!templateId) { setSelectedTemplate(null); setManualValues({}); return; }
    const tpl = templates.find(t => String(t.id) === templateId);
    setSelectedTemplate(tpl || null);
    setManualValues({});
  }, [templateId, templates]);

  useEffect(() => {
    if (!clientId) return;
    const client = clients.find(c => String(c.id) === clientId);
    if (client) setEmailTo(client.email || '');
  }, [clientId, clients]);

  const handleManualChange = (key, value) => {
    setManualValues(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    if (!clientId || !templateId) { toast.error('Selecione cliente e tipo de documento'); return; }
    if (submittingRef.current) return; // useRef é síncrono — bloqueia mesmo cliques rápidos
    submittingRef.current = true;
    setIsSubmitting(true);

    setStep('generating');
    const steps = ['Carregando dados do cliente...', 'Preenchendo template...', 'Convertendo para PDF...', 'Enviando por email...'];
    let s = 0;
    const iv = setInterval(() => {
      s = Math.min(s + 1, steps.length - 1);
      setStepProgress(s);
    }, 900);

    try {
      const res = await api.post('/documents/generate', {
        client_id: parseInt(clientId, { timeout: 120000 }),
        template_id: parseInt(templateId),
        manual_values: manualValues,
        send_email: sendEmail,
        email_to: emailTo || undefined,
      });
      clearInterval(iv);
      setStepProgress(steps.length); // marcar todos como concluídos
      setResult(res.data);
      setStep('done'); // sair do spinner ANTES de chamar onSuccess
      try { onSuccess?.(); } catch(e) { /* não deixar erro do parent travar o modal */ }
    } catch (err) {
      clearInterval(iv);
      toast.error(err.response?.data?.error || 'Erro ao gerar documento');
      setStep('form');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const getInputType = (type) => {
    if (type === 'date') return 'date';
    if (type === 'number' || type === 'currency' || type === 'percent') return 'text';
    return 'text';
  };

  const getPlaceholder = (field) => {
    if (field.type === 'currency') return 'Ex: R$ 1.500,00';
    if (field.type === 'percent') return 'Ex: 20%';
    if (field.type === 'date') return '';
    return `Preencha: ${field.label}`;
  };

  const progressSteps = [
    'Carregando dados do cliente',
    'Preenchendo template com IA',
    'Convertendo para PDF',
    'Enviando por email',
  ];

  return (
    <Modal
      open={open}
      onClose={step === 'generating' ? undefined : onClose}
      title="Gerar documento"
      width={600}
      footer={step === 'form' ? (
        <>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn
            onClick={handleGenerate}
            disabled={isSubmitting || step === 'generating'}
            style={{ opacity: (isSubmitting || step === 'generating') ? 0.6 : 1,
                     cursor: (isSubmitting || step === 'generating') ? 'not-allowed' : 'pointer' }}>
            {isSubmitting ? '⏳ Gerando...' : 'Gerar documento'}
          </Btn>
        </>
      ) : step === 'done' ? (
        <>
          {result?.pdf_url && <Btn variant="outline" onClick={() => abrirArquivoAutenticado(result.pdf_url)}>Baixar PDF</Btn>}
          <Btn onClick={onClose}>Concluir</Btn>
        </>
      ) : null}
    >
      {step === 'form' && (
        <>
          <SectionTitle>1. Cliente</SectionTitle>
          <FormGrid cols={1}>
            <FormField label="Selecione o cliente">
              <SearchableSelect
                value={clientId}
                onChange={val => setClientId(String(val))}
                options={clients.map(c => ({ value: c.id, label: `${c.nome}${c.cpf ? ' — ' + c.cpf : ''}` }))}
                placeholder="Escolha um cliente..."
              />
            </FormField>
          </FormGrid>

          <SectionTitle>2. Tipo de documento</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '0.5rem' }}>
            {templates.map(t => (
              <div
                key={t.id}
                onClick={() => setTemplateId(String(t.id))}
                style={{
                  border: templateId === String(t.id) ? '2px solid #1a3a5c' : '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 8, padding: '0.75rem 1rem', cursor: 'pointer',
                  background: templateId === String(t.id) ? '#e8f0fe' : 'white',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <FileText size={18} color="#185fa5" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#6b6b68' }}>{t.type}</div>
                </div>
              </div>
            ))}
          </div>

          {selectedTemplate?.manual_fields?.length > 0 && (
            <>
              <div style={{ background: '#fffbf0', border: '0.5px solid #fac775', borderRadius: 8, padding: '1rem', margin: '0.75rem 0' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#854f0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  ✏️ Preencha os campos do contrato
                </p>
                <FormGrid cols={2}>
                  {selectedTemplate.manual_fields.map(field => (
                    <FormField key={field.key} label={field.label}>
                      <input
                        type={getInputType(field.type)}
                        placeholder={getPlaceholder(field)}
                        value={manualValues[field.key] || ''}
                        onChange={e => handleManualChange(field.key, e.target.value)}
                      />
                    </FormField>
                  ))}
                </FormGrid>
              </div>
            </>
          )}

          {selectedTemplate?.auto_fields?.length > 0 && (
            <div style={{ background: '#f0f7ff', border: '0.5px solid #b5d4f4', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#185fa5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                🤖 Campos preenchidos automaticamente
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedTemplate.auto_fields.map(f => (
                  <Badge key={f} color="blue">{f}</Badge>
                ))}
              </div>
            </div>
          )}

          <SectionTitle>3. Envio por email</SectionTitle>
          <FormGrid cols={2}>
            <FormField label="Email do destinatário">
              <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="cliente@email.com" />
            </FormField>
            <FormField label="Envio automático">
              <select value={sendEmail ? 'sim' : 'nao'} onChange={e => setSendEmail(e.target.value === 'sim')}>
                <option value="sim">Sim, enviar por email</option>
                <option value="nao">Não, apenas gerar PDF</option>
              </select>
            </FormField>
          </FormGrid>
        </>
      )}

      {step === 'generating' && (
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: '1.25rem' }}>Gerando documento...</p>
          {progressSteps.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < progressSteps.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: stepProgress > i ? '#eaf3de' : stepProgress === i ? '#e8f0fe' : '#f5f5f0',
                border: `0.5px solid ${stepProgress > i ? '#97c459' : stepProgress === i ? '#185fa5' : 'rgba(0,0,0,0.1)'}`,
              }}>
                {stepProgress > i
                  ? <CheckCircle size={14} color="#3b6d11" />
                  : stepProgress === i
                  ? <Loader size={12} color="#185fa5" style={{ animation: 'spin 1s linear infinite' }} />
                  : <span style={{ fontSize: 11, color: '#9a9a97' }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 13, color: stepProgress >= i ? '#1a1a18' : '#9a9a97' }}>{label}</span>
            </div>
          ))}
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <div style={{ width: 56, height: 56, background: '#eaf3de', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <CheckCircle size={26} color="#3b6d11" />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Documento gerado!</h3>
          <p style={{ fontSize: 13, color: '#6b6b68' }}>
            {result?.email_sent ? 'PDF gerado e enviado por email ao cliente.' : 'PDF gerado e salvo na pasta do cliente.'}
          </p>
          {result?.email_preview && (
            <a href={result.email_preview} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#185fa5' }}>
              Preview do email enviado →
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}

