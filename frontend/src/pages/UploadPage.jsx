// front-end/src/pages/UploadPage.jsx
// Página pública — o cliente acessa sem login
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { Upload, Check, AlertCircle, Clock } from 'lucide-react';

const publicApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
});

export default function UploadPage() {
  const { token } = useParams();
  const [linkData, setLinkData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sentDocs, setSentDocs] = useState({});
  const [allSent, setAllSent] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null);

  // Dados de contato do cliente
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactSaved, setContactSaved] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');

  useEffect(() => {
    publicApi.get(`/upload-links/${token}`)
      .then(r => {
        setLinkData(r.data);
        setAllSent(r.data.completed);
        // Pré-preencher se já cadastrado
        if (r.data.client_email) setEmail(r.data.client_email);
        if (r.data.client_phone) setPhone(r.data.client_phone);
        // Se já tem os dois, pular etapa de contato
        if (r.data.client_email && r.data.client_phone) setContactSaved(true);
      })
      .catch(err => {
        if (err.response?.status === 410) setError('expirado');
        else setError('nao_encontrado');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const saveContact = async () => {
    setContactError('');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneOk = phone.replace(/\D/g,'').length >= 10;
    if (!emailOk) return setContactError('Informe um e-mail válido.');
    if (!phoneOk) return setContactError('Informe o telefone com DDD (ex: 11912345678).');
    setSavingContact(true);
    try {
      await publicApi.post(`/upload-links/${token}/contact`, { email, phone: phone.replace(/\D/g,'') });
      setContactSaved(true);
    } catch {
      setContactError('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingContact(false);
    }
  };

  const onDrop = useCallback(async (accepted, docKey) => {
    if (!accepted.length) return;
    setSentDocs(prev => ({ ...prev, [docKey]: 'sending' }));

    const fd = new FormData();
    accepted.forEach(f => fd.append('files', f));
    fd.append('doc_key', docKey);

    try {
      const res = await publicApi.post(`/upload-links/${token}/files`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSentDocs(prev => ({ ...prev, [docKey]: 'done' }));
      if (res.data.all_sent) setAllSent(true);
    } catch {
      setSentDocs(prev => ({ ...prev, [docKey]: 'error' }));
    }
  }, [token]);

  if (loading) return <Screen><Spinner /></Screen>;

  if (error === 'expirado') return (
    <Screen>
      <div style={{ textAlign: 'center' }}>
        <Clock size={48} color="#c5a859" style={{ marginBottom: 12 }} />
        <h2 style={h2}>Link expirado</h2>
        <p style={sub}>Este link de envio não é mais válido. Entre em contato com o escritório.</p>
        <Contact />
      </div>
    </Screen>
  );

  if (error) return (
    <Screen>
      <div style={{ textAlign: 'center' }}>
        <AlertCircle size={48} color="#a32d2d" style={{ marginBottom: 12 }} />
        <h2 style={h2}>Link não encontrado</h2>
        <p style={sub}>Verifique o link recebido ou entre em contato com o escritório.</p>
        <Contact />
      </div>
    </Screen>
  );

  if (allSent) return (
    <Screen>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
        <h2 style={h2}>Documentos enviados!</h2>
        <p style={sub}>
          Recebemos tudo, {linkData?.client_nome?.split(' ')[0]}!<br />
          Nossa equipe irá analisar e entrar em contato em breve.
        </p>
        <Contact />
      </div>
    </Screen>
  );

  const requiredDocs = linkData?.required_docs || [];
  const templates = linkData?.templates || [];

  return (
    <Screen>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          width: 56, height: 56, background: '#0f2035', borderRadius: 10,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 24 }}>⚖️</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a18', margin: '0 0 4px' }}>
          Escritório Andreia Machado
        </h1>
        <p style={{ fontSize: 13, color: '#6b6b68', margin: 0 }}>Advocacia · OAB/RJ 218.586</p>
      </div>

      {/* Saudação */}
      <div style={{
        background: '#f5f5f0', borderRadius: 10, padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
      }}>
        <p style={{ fontSize: 14, color: '#1a1a18', margin: '0 0 4px', fontWeight: 500 }}>
          Olá, {linkData.client_nome?.split(' ')[0]}! 👋
        </p>
        <p style={{ fontSize: 13, color: '#6b6b68', margin: 0 }}>
          {linkData.message || 'Para darmos andamento ao seu processo, precisamos que você envie os documentos abaixo.'}
        </p>
      </div>

      {/* Documentos a serem gerados */}
      {templates.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#6b6b68', marginBottom: 8 }}>
            DOCUMENTOS QUE SERÃO PREPARADOS PARA VOCÊ
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#e8f0fe', borderRadius: 6, padding: '8px 12px',
              }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <span style={{ fontSize: 13, color: '#185fa5' }}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dados de contato */}
      {!contactSaved ? (
        <div style={{ background: '#f8f7f3', border: '1px solid #e5e2d6', borderRadius: 10, padding: '1.2rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0d2340', marginBottom: 12 }}>
            📋 CONFIRME SEUS DADOS DE CONTATO
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b6b68', display: 'block', marginBottom: 4 }}>E-MAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d0cfc7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b6b68', display: 'block', marginBottom: 4 }}>TELEFONE COM DDD</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="11912345678"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d0cfc7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            {contactError && <p style={{ color: '#a32d2d', fontSize: 12, margin: 0 }}>{contactError}</p>}
            <button
              onClick={saveContact}
              disabled={savingContact}
              style={{ background: '#c5a859', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: savingContact ? 0.7 : 1 }}
            >
              {savingContact ? 'Salvando...' : 'Confirmar dados →'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>Dados confirmados</span>
            <p style={{ margin: 0, fontSize: 12, color: '#166534' }}>{email} · {phone}</p>
          </div>
          <button onClick={() => setContactSaved(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 11, color: '#6b6b68', cursor: 'pointer' }}>Editar</button>
        </div>
      )}

      {/* Upload dos documentos — só mostra após confirmar contato */}
      {contactSaved && <p style={{ fontSize: 12, fontWeight: 500, color: '#6b6b68', marginBottom: 12 }}>
        ENVIE OS DOCUMENTOS ABAIXO
      </p>}
      {!contactSaved && <p style={{ fontSize: 12, color: '#6b6b68', textAlign: 'center', marginBottom: 12 }}>
        ↑ Confirme seus dados para liberar o envio de documentos
      </p>}
      {contactSaved && <>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {requiredDocs.map(doc => (
          <DocUploadCard
            key={doc.key}
            doc={doc}
            status={sentDocs[doc.key]}
            active={activeDoc === doc.key}
            onSetActive={setActiveDoc}
            onDrop={(files) => onDrop(files, doc.key)}
          />
        ))}
      </div>

      {/* Progresso */}
      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#6b6b68', marginBottom: 6 }}>
          {Object.values(sentDocs).filter(s => s === 'done').length} de {requiredDocs.length} documentos enviados
        </div>
        <div style={{ height: 6, background: '#f0f0ec', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            background: '#22c55e',
            borderRadius: 99,
            width: `${requiredDocs.length ? (Object.values(sentDocs).filter(s => s === 'done').length / requiredDocs.length) * 100 : 0}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      </> }

      <Contact style={{ marginTop: '2rem' }} />
    </Screen>
  );
}

// ─── Componente de upload individual ─────────────────────────────────────────
function DocUploadCard({ doc, status, active, onSetActive, onDrop }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onDrop(acceptedFiles),
    multiple: true,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.heic', '.webp'],
      'application/pdf': ['.pdf'],
    },
  });

  const isDone = status === 'done';
  const isError = status === 'error';
  const isSending = status === 'sending';

  return (
    <div style={{
      border: `1.5px solid ${isDone ? '#22c55e' : isError ? '#ef4444' : isDragActive ? '#1a3a5c' : 'rgba(0,0,0,0.15)'}`,
      borderRadius: 10, overflow: 'hidden',
      background: isDone ? '#f0fdf4' : 'white',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', cursor: isDone ? 'default' : 'pointer',
        }}
        onClick={() => !isDone && onSetActive(active ? null : doc.key)}
      >
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: isDone ? '#22c55e' : '#f5f5f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isDone
            ? <Check size={16} color="white" />
            : <span style={{ fontSize: 16 }}>📄</span>
          }
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: isDone ? '#15803d' : '#1a1a18' }}>
            {doc.label}
          </p>
          <p style={{ fontSize: 11, color: isDone ? '#15803d' : '#9a9a97', margin: 0 }}>
            {isDone ? 'Enviado com sucesso ✓' : isSending ? 'Enviando...' : 'Foto ou PDF · Toque para enviar'}
          </p>
        </div>
        {!isDone && (
          <Upload size={16} color="#6b6b68" />
        )}
      </div>

      {/* Dropzone expandida */}
      {!isDone && (active || isDragActive) && (
        <div
          {...getRootProps()}
          style={{
            borderTop: '1px solid rgba(0,0,0,0.08)',
            padding: '1rem',
            background: isDragActive ? '#f0f7ff' : '#fafaf8',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <input {...getInputProps()} />
          <Upload size={20} color="#1a3a5c" style={{ margin: '0 auto 6px', display: 'block' }} />
          <p style={{ fontSize: 13, color: '#1a3a5c', margin: '0 0 2px', fontWeight: 500 }}>
            {isSending ? 'Enviando...' : 'Toque aqui ou arraste o arquivo'}
          </p>
          <p style={{ fontSize: 11, color: '#9a9a97', margin: 0 }}>
            JPG, PNG, HEIC ou PDF · Máx. 5MB
          </p>
        </div>
      )}

      {isError && (
        <div style={{ padding: '8px 14px', background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
          <p style={{ fontSize: 12, color: '#a32d2d', margin: 0 }}>
            Erro ao enviar. Tente novamente.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Screen({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f5f5f0',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: '1.5rem',
        width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        {children}
      </div>
    </div>
  );
}

function Contact() {
  return (
    <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
      <p style={{ fontSize: 11, color: '#9a9a97' }}>
        Dúvidas? Entre em contato:{' '}
        <a href="https://wa.me/5511967351199" style={{ color: '#1a3a5c' }}>
          (11) 96735-1199
        </a>
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b6b68', fontSize: 14 }}>
      Carregando...
    </div>
  );
}

const h2 = { fontSize: 18, fontWeight: 600, margin: '0 0 8px' };
const sub = { fontSize: 14, color: '#6b6b68', lineHeight: 1.6, margin: '0 0 16px' };
