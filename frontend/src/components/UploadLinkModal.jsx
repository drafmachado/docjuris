// front-end/src/components/UploadLinkModal.jsx
import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { X, Link, Copy, Check } from 'lucide-react';

const REQUIRED_DOCS_OPTIONS = [
  { key: 'rg', label: 'RG / CNH' },
  { key: 'cpf', label: 'CPF' },
  { key: 'comprovante_residencia', label: 'Comprovante de residência' },
  { key: 'comprovante_renda', label: 'Comprovante de renda' },
  { key: 'certidao_nascimento', label: 'Certidão de nascimento' },
  { key: 'certidao_casamento', label: 'Certidão de casamento' },
  { key: 'procuracao_assinada', label: 'Procuração assinada' },
  { key: 'boletim_ocorrencia', label: 'Boletim de ocorrência' },
  { key: 'contrato_anterior', label: 'Contrato anterior' },
  { key: 'outros', label: 'Outros documentos' },
];

export default function UploadLinkModal({ open, client, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState(['rg', 'cpf']);
  const [manualValues, setManualValues] = useState({});
  const [message, setMessage] = useState('');
  const [expiresIn, setExpiresIn] = useState(7);
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [manualFields, setManualFields] = useState([]);

  useEffect(() => {
    if (open) {
      api.get('/templates').then(r => setTemplates(r.data)).catch(() => {});
      setGeneratedLink(null);
      setSelectedTemplates([]);
      setSelectedDocs(['rg', 'cpf']);
      setManualValues({});
      setMessage('');
      setManualFields([]);
    }
  }, [open]);

  // Quando seleciona templates, extrai campos manuais únicos
  useEffect(() => {
    const fields = [];
    const seen = new Set();
    selectedTemplates.forEach(id => {
      const t = templates.find(t => t.id === id);
      if (!t) return;
      const mf = Array.isArray(t.manual_fields) ? t.manual_fields : JSON.parse(t.manual_fields || '[]');
      mf.forEach(f => {
        if (!seen.has(f.key)) {
          seen.add(f.key);
          fields.push(f);
        }
      });
    });
    setManualFields(fields);
  }, [selectedTemplates, templates]);

  const toggleTemplate = (id) => {
    setSelectedTemplates(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleDoc = (key) => {
    setSelectedDocs(prev =>
      prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
    );
  };

  const handleGenerate = async () => {
    if (!selectedTemplates.length) {
      toast.error('Selecione ao menos um documento para gerar');
      return;
    }
    setLoading(true);
    try {
      const requiredDocs = REQUIRED_DOCS_OPTIONS.filter(d => selectedDocs.includes(d.key));
      const res = await api.post('/upload-links', {
        client_id: client.id,
        template_ids: selectedTemplates,
        required_docs: requiredDocs,
        manual_values: manualValues,
        message,
        expires_in_days: expiresIn,
      });
      setGeneratedLink(res.data.link);
      toast.success('Link gerado com sucesso!');
    } catch {
      toast.error('Erro ao gerar link');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copiado!');
  };

  const whatsappLink = () => {
    const text = encodeURIComponent(
      `Olá, ${client.nome}! Para darmos andamento ao seu processo, preciso que envie alguns documentos pelo link abaixo:\n\n${generatedLink}\n\n${message ? `Observação: ${message}` : ''}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '1rem',
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflow: 'auto', padding: '1.5rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Gerar link de upload</h3>
            <p style={{ fontSize: 12, color: '#6b6b68', margin: '2px 0 0' }}>{client.nome}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b68' }}>
            <X size={18} />
          </button>
        </div>

        {!generatedLink ? (
          <>
            {/* Seleção de Templates */}
            <section style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Documentos a gerar automaticamente</label>
              <p style={{ fontSize: 11, color: '#9a9a97', marginBottom: 8 }}>
                Quando o cliente enviar tudo, estes documentos serão gerados automaticamente
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {templates.filter(t => t.active).map(t => (
                  <label key={t.id} style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={selectedTemplates.includes(t.id)}
                      onChange={() => toggleTemplate(t.id)}
                    />
                    <span style={{ fontSize: 13 }}>
                      {t.name}
                      <span style={{ color: '#9a9a97', fontSize: 11, marginLeft: 6 }}>({t.type})</span>
                    </span>
                  </label>
                ))}
                {!templates.length && (
                  <p style={{ fontSize: 12, color: '#9a9a97' }}>
                    Nenhum template cadastrado ainda.{' '}
                    <a href="/templates" style={{ color: '#1a3a5c' }}>Cadastrar templates</a>
                  </p>
                )}
              </div>
            </section>

            {/* Campos manuais dos templates selecionados */}
            {manualFields.length > 0 && (
              <section style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Valores para preenchimento</label>
                <p style={{ fontSize: 11, color: '#9a9a97', marginBottom: 8 }}>
                  Estes valores serão inseridos automaticamente nos documentos
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {manualFields.map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: '#6b6b68', display: 'block', marginBottom: 3 }}>
                        {f.label}
                      </label>
                      <input
                        type={f.type === 'number' ? 'text' : f.type || 'text'}
                        placeholder={f.placeholder || f.label}
                        value={manualValues[f.key] || ''}
                        onChange={e => setManualValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Documentos necessários do cliente */}
            <section style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Documentos que o cliente deve enviar</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {REQUIRED_DOCS_OPTIONS.map(d => (
                  <label key={d.key} style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(d.key)}
                      onChange={() => toggleDoc(d.key)}
                    />
                    <span style={{ fontSize: 13 }}>{d.label}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Mensagem */}
            <section style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Mensagem para o cliente (opcional)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Ex: Por favor envie os documentos até sexta-feira."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </section>

            {/* Validade */}
            <section style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Validade do link</label>
              <select
                value={expiresIn}
                onChange={e => setExpiresIn(Number(e.target.value))}
                style={inputStyle}
              >
                <option value={3}>3 dias</option>
                <option value={7}>7 dias</option>
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
              </select>
            </section>

            <button
              onClick={handleGenerate}
              disabled={loading || !selectedTemplates.length}
              style={{
                width: '100%', padding: '12px', background: loading || !selectedTemplates.length ? '#ccc' : '#1a3a5c',
                color: 'white', border: 'none', borderRadius: 8, fontSize: 14,
                fontWeight: 500, cursor: loading || !selectedTemplates.length ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Gerando...' : '🔗 Gerar link de upload'}
            </button>
          </>
        ) : (
          /* Link gerado */
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Link gerado com sucesso!</h4>
            <p style={{ fontSize: 12, color: '#6b6b68', marginBottom: '1.25rem' }}>
              Quando o cliente enviar todos os documentos, os arquivos serão gerados automaticamente
              e você receberá um email de notificação.
            </p>

            <div style={{
              background: '#f5f5f0', borderRadius: 8, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem',
              wordBreak: 'break-all', textAlign: 'left',
            }}>
              <Link size={14} color="#6b6b68" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, flex: 1, color: '#1a1a18' }}>{generatedLink}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
              <button onClick={copyLink} style={{
                flex: 1, padding: '10px', background: copied ? '#22c55e' : '#1a3a5c',
                color: 'white', border: 'none', borderRadius: 8, fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar link</>}
              </button>
              <button onClick={whatsappLink} style={{
                flex: 1, padding: '10px', background: '#25d366',
                color: 'white', border: 'none', borderRadius: 8, fontSize: 13,
                cursor: 'pointer',
              }}>
                📱 Enviar pelo WhatsApp
              </button>
            </div>

            <button onClick={onClose} style={{
              width: '100%', padding: '10px', background: 'none',
              border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13,
              cursor: 'pointer', color: '#6b6b68',
            }}>
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 500, color: '#1a1a18', display: 'block', marginBottom: 6 };
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '0.5px solid rgba(0,0,0,0.2)',
  borderRadius: 6, fontSize: 13, background: 'white', boxSizing: 'border-box',
};
const checkboxRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  padding: '6px 8px', borderRadius: 6, fontSize: 13,
};
