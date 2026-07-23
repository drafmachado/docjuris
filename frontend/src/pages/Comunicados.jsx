import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Send, Clock, Users, CheckCircle, Image as ImageIcon, X, Smartphone } from 'lucide-react';
import { useRef } from 'react';

export default function Comunicados() {
  const [mensagem, setMensagem] = useState('');
  const [historico, setHistorico] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [preview, setPreview] = useState(false);
  const [imagem, setImagem] = useState(null);        // { base64, mimetype, filename, url }
  const [publico, setPublico] = useState('clientes');
  const [totalDest, setTotalDest] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [instancia, setInstancia] = useState('');
  const fileRef = useRef(null);

  // Prévia de quantos vão receber
  useEffect(() => {
    api.get(`/comunicados/destinatarios?publico=${publico}`)
      .then(r => setTotalDest(r.data)).catch(() => setTotalDest(null));
  }, [publico]);

  useEffect(() => {
    api.get('/whatsapp-admin/instancias').then(r => {
      const ativas = (r.data || []).filter(i => ['open', 'connected'].includes(String(i.estado).toLowerCase()));
      setLinhas(ativas);
      if (ativas.length && !instancia) setInstancia(ativas[0].nome);
    }).catch(() => {});
  }, []);

  function escolherImagem(ev) {
    const f = ev.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Selecione uma imagem');
    if (f.size > 5 * 1024 * 1024) return toast.error('Imagem acima de 5MB — reduza antes de enviar');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setImagem({
        base64: dataUrl.split(',')[1],
        mimetype: f.type,
        filename: f.name,
        url: dataUrl,
      });
    };
    reader.readAsDataURL(f);
  }

  useEffect(() => { carregarHistorico(); }, []);

  async function carregarHistorico() {
    try {
      const res = await api.get('/comunicados');
      setHistorico(res.data);
    } catch {}
  }

  async function enviar() {
    if (!mensagem.trim() && !imagem) return toast.error('Escreva a mensagem ou anexe uma imagem');
    const rotulo = { clientes: 'CLIENTES', leads: 'LEADS do funil', clientes_e_leads: 'CLIENTES e LEADS' }[publico];
    if (!window.confirm(
      `Enviar para ${totalDest?.total ?? '?'} destinatário(s) — ${rotulo}?\n\n` +
      `Linha de envio: ${instancia || 'padrão'}\n` +
      (imagem ? `Com imagem: ${imagem.filename}\n` : '') +
      `\nMensagem:\n${mensagem || '(somente imagem)'}`
    )) return;

    setEnviando(true);
    try {
      const res = await api.post('/comunicados/send', { mensagem, publico, instancia, imagem: imagem ? { base64: imagem.base64, mimetype: imagem.mimetype, filename: imagem.filename } : null });
      toast.success(`Enviando para ${res.data.total} destinatário(s)...`);
      setMensagem('');
      setImagem(null);
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 170 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b6b68', display: 'block', marginBottom: 5 }}>PARA QUEM</label>
            <select value={publico} onChange={e => setPublico(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #d0cfc7', fontSize: 13 }}>
              <option value="clientes">Clientes</option>
              <option value="leads">Leads do funil (em negociação)</option>
              <option value="clientes_e_leads">Clientes + Leads</option>
            </select>
            {totalDest && (
              <div style={{ fontSize: 11.5, color: '#3b6d11', marginTop: 4, fontWeight: 600 }}>
                {totalDest.total} destinatário(s){totalDest.amostra?.length ? ` — ex: ${totalDest.amostra.slice(0, 2).join(', ')}...` : ''}
              </div>
            )}
          </div>
          {linhas.length > 1 && (
            <div style={{ flex: 1, minWidth: 170 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b6b68', display: 'block', marginBottom: 5 }}>ENVIAR PELA LINHA</label>
              <select value={instancia} onChange={e => setInstancia(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #d0cfc7', fontSize: 13 }}>
                {linhas.map(l => <option key={l.nome} value={l.nome}>{l.numero || l.nome}</option>)}
              </select>
            </div>
          )}
        </div>

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

        <input type="file" accept="image/*" ref={fileRef} onChange={escolherImagem} style={{ display: 'none' }} />

        {imagem ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f8f7f3',
            borderRadius: 10, padding: '10px 12px', marginTop: 12 }}>
            <img src={imagem.url} alt="prévia" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2035' }}>{imagem.filename}</div>
              <div style={{ fontSize: 11.5, color: '#6b6b68' }}>A mensagem vai como legenda da imagem</div>
            </div>
            <button onClick={() => { setImagem(null); if (fileRef.current) fileRef.current.value = ''; }}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
              <X size={13} color="#c9372c" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, background: '#f0f4ff',
              color: '#0d2340', border: '1.5px dashed #c7d2fe', borderRadius: 9, padding: '9px 14px',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <ImageIcon size={14} /> Anexar imagem / post (opcional)
          </button>
        )}

        <div style={{ fontSize: 11.5, color: '#854f0b', background: '#fdf6e3', borderRadius: 8,
          padding: '7px 11px', marginTop: 10 }}>
          Dica: escreva <b>{'{nome}'}</b> na mensagem para personalizar com o primeiro nome de cada destinatário.
        </div>

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
              disabled={enviando || (!mensagem.trim() && !imagem)}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: enviando || (!mensagem.trim() && !imagem) ? '#ccc' : '#25d366',
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: enviando || (!mensagem.trim() && !imagem) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Send size={14} />
              {enviando ? 'Enviando...' : `Enviar${totalDest?.total ? ` (${totalDest.total})` : ''}`}
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


