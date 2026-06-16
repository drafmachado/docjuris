import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Send, Clock, Users, CheckCircle } from 'lucide-react';

export default function Comunicados() {
  const [mensagem, setMensagem] = useState('');
  const [historico, setHistorico] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => { carregarHistorico(); }, []);

  async function carregarHistorico() {
    try {
      const res = await api.get('/comunicados');
      setHistorico(res.data);
    } catch {}
  }

  async function enviar() {
    if (!mensagem.trim()) return toast.error('Escreva a mensagem antes de enviar');
    if (!window.confirm(`Enviar para TODOS os clientes com WhatsApp cadastrado?\n\nMensagem:\n${mensagem}`)) return;

    setEnviando(true);
    try {
      const res = await api.post('/comunicados/send', { mensagem });
      toast.success(`Enviando para ${res.data.total} clientes...`);
      setMensagem('');
      setPreview(false);
      setTimeout(carregarHistorico, 3000);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar');
    } finally {
      setEnviando(false);
    }
  }

  const chars = mensagem.length;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0d2340', marginBottom: 4, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
        📣 Comunicados
      </h2>
      <p style={{ fontSize: 13, color: '#6b6b68', marginBottom: '1.5rem' }}>
        Envie mensagens para todos os seus clientes via WhatsApp de uma vez.
      </p>

      {/* Editor */}
      <div style={{ background: '#fff', border: '1px solid #e5e2d6', borderRadius: 12, padding: '1.2rem', marginBottom: '1rem' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b6b68', display: 'block', marginBottom: 8 }}>
          MENSAGEM
        </label>
        <textarea
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          placeholder="Cole aqui o texto do seu post ou escreva a mensagem que será enviada para todos os clientes..."
          rows={8}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px',
            border: '1px solid #d0cfc7', borderRadius: 8, fontSize: 14,
            fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: chars > 1000 ? '#e53e3e' : '#6b6b68' }}>
            {chars} caracteres {chars > 1000 && '— mensagem longa pode ser truncada'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPreview(!preview)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d0cfc7', background: '#fff', fontSize: 13, cursor: 'pointer' }}
            >
              {preview ? 'Editar' : 'Preview'}
            </button>
            <button
              onClick={enviar}
              disabled={enviando || !mensagem.trim()}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: enviando || !mensagem.trim() ? '#ccc' : '#25d366',
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: enviando || !mensagem.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Send size={14} />
              {enviando ? 'Enviando...' : 'Enviar para todos'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview WhatsApp */}
      {preview && mensagem && (
        <div style={{ background: '#e5ddd5', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b6b68', marginBottom: 8 }}>PREVIEW (como aparece no WhatsApp)</p>
          <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', maxWidth: 320, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: 14, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{mensagem}</p>
            <p style={{ fontSize: 11, color: '#999', margin: '6px 0 0', textAlign: 'right' }}>
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0d2340', marginBottom: 12 }}>Histórico de envios</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historico.map(c => (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e2d6', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#166534' }}>
                      <CheckCircle size={12} /> {c.enviados} enviados
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b6b68' }}>
                      <Users size={12} /> {c.total_destinatarios} clientes
                    </span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b6b68' }}>
                    <Clock size={11} />
                    {new Date(c.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: '#333', margin: 0, whiteSpace: 'pre-wrap',
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {c.mensagem}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
