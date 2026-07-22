// Conexões de WhatsApp — os números do escritório que alimentam o CRM.
// Criar conexão → escanear QR code com o aparelho → leads automáticos ativos.
import { useState, useEffect, useRef } from 'react';
import { Topbar, Btn, Modal, FormField, FormGrid } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Plus, Smartphone, RefreshCw, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export default function WhatsAppNumeros() {
  const [instancias, setInstancias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalNova, setModalNova] = useState(false);
  const [nomeNova, setNomeNova] = useState('');
  const [criando, setCriando] = useState(false);
  const [qrDe, setQrDe] = useState(null);      // nome da instância exibindo QR
  const [qrImg, setQrImg] = useState(null);
  const pollRef = useRef(null);
  const [analise, setAnalise] = useState(null);   // job em andamento
  const analisePoll = useRef(null);

  async function analisarConversas(instancia) {
    if (!window.confirm(
      `Analisar as conversas de "${instancia}" com IA?\n\n` +
      `• Contatos que já são clientes ou leads são ignorados\n` +
      `• Conversas de cliente → novo cadastro de cliente (a completar)\n` +
      `• Conversas em negociação → lead no funil, com resumo do caso\n` +
      `• Pessoais/irrelevantes → ignorados\n\n` +
      `Leva alguns minutos e usa créditos da IA.`
    )) return;
    try {
      const r = await api.post('/whatsapp-admin/analisar-conversas', { instancia });
      const jobId = r.data.jobId;
      setAnalise({ status: 'processing', processados: 0, total: 0 });
      clearInterval(analisePoll.current);
      analisePoll.current = setInterval(async () => {
        try {
          const s = await api.get(`/whatsapp-admin/analisar-conversas/status/${jobId}`);
          setAnalise(s.data);
          if (s.data.status === 'done' || s.data.status === 'error') {
            clearInterval(analisePoll.current);
            if (s.data.status === 'done') {
              toast.success(`Análise concluída: ${s.data.clientes_criados} cliente(s) e ${s.data.leads_criados} lead(s) criados`, { duration: 8000 });
            } else toast.error('Análise falhou: ' + (s.data.erroGeral || ''));
          }
        } catch { clearInterval(analisePoll.current); }
      }, 3000);
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao iniciar análise'); }
  }

  const load = () => {
    api.get('/whatsapp-admin/instancias')
      .then(r => setInstancias(r.data))
      .catch(e => toast.error(e.response?.data?.error || 'Erro ao listar conexões'))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { load(); return () => clearInterval(pollRef.current); }, []);

  async function criar() {
    if (!nomeNova.trim()) return toast.error('Dê um nome (ex: thaisa, escritorio)');
    setCriando(true);
    try {
      const r = await api.post('/whatsapp-admin/instancias', { nome: nomeNova });
      toast.success('Conexão criada! Agora escaneie o QR code.');
      setModalNova(false); setNomeNova('');
      load();
      abrirQR(r.data.nome);
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao criar'); }
    finally { setCriando(false); }
  }

  async function abrirQR(nome) {
    setQrDe(nome); setQrImg(null);
    const buscar = async () => {
      try {
        const r = await api.get(`/whatsapp-admin/instancias/${nome}/qr`);
        if (r.data.conectado) {
          toast.success(`"${nome}" conectada!`);
          clearInterval(pollRef.current);
          setQrDe(null); load();
          return;
        }
        if (r.data.qr) setQrImg(r.data.qr);
      } catch(e) { /* mantém tentando */ }
    };
    buscar();
    clearInterval(pollRef.current);
    pollRef.current = setInterval(buscar, 15000); // QR expira — renova a cada 15s
  }

  function fecharQR() { clearInterval(pollRef.current); setQrDe(null); setQrImg(null); load(); }

  const conectada = (e) => ['open', 'connected'].includes(String(e).toLowerCase());

  return (
    <div>
      <Topbar title="Números de WhatsApp">
        <Btn onClick={() => setModalNova(true)}><Plus size={14} /> Conectar novo número</Btn>
      </Topbar>

      <p style={{ fontSize: 13, color: '#6b6b68', margin: '0 0 16px', maxWidth: 640 }}>
        Cada número conectado aqui alimenta o CRM: mensagem de número desconhecido vira <b>lead automático</b> no funil.
        Os envios do sistema (códigos do portal, comunicados, alertas) continuam saindo apenas pelo número principal.
      </p>

      {carregando && <p style={{ color: '#9a9a97' }}>Carregando conexões...</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {instancias.map(inst => (
          <div key={inst.nome} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.05)', borderTop: `3px solid ${conectada(inst.estado) ? '#3b6d11' : '#c9372c'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Smartphone size={16} color="#0f2035" />
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0f2035' }}>{inst.nome}</span>
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>
              {inst.numero || <i style={{ color: '#9a9a97' }}>número não identificado</i>}
              {inst.perfil && <span style={{ color: '#9a9a97' }}> — {inst.perfil}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700,
              color: conectada(inst.estado) ? '#3b6d11' : '#c9372c', marginBottom: 10 }}>
              {conectada(inst.estado) ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {conectada(inst.estado) ? 'Conectada — leads ativos' : `Desconectada (${inst.estado})`}
            </div>
            {conectada(inst.estado) && (
              <button onClick={() => analisarConversas(inst.nome)}
                disabled={analise?.status === 'processing'}
                style={{ width: '100%', padding: '9px', background: '#fdf6e3', color: '#854f0b',
                  border: '1.5px solid #e8d9a8', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                  cursor: analise?.status === 'processing' ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Sparkles size={13} /> Analisar conversas com IA
              </button>
            )}
            {!conectada(inst.estado) && (
              <button onClick={() => abrirQR(inst.nome)}
                style={{ width: '100%', padding: '9px', background: '#0f2035', color: '#fff', border: 'none',
                  borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Mostrar QR code para conectar
              </button>
            )}
          </div>
        ))}
      </div>

      {analise && (
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', marginTop: 18,
          border: '1.5px solid #e8d9a8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span style={{ fontWeight: 800, color: '#0f2035' }}>
              {analise.status === 'done' ? '✅ Análise concluída' : `🔎 Analisando conversas... (${analise.fase || ''})`}
            </span>
            <span>{analise.processados}/{analise.total}</span>
          </div>
          <div style={{ background: '#e5e7eb', borderRadius: 10, height: 9, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ background: '#0f2035', height: '100%', borderRadius: 10,
              width: `${analise.total ? (analise.processados / analise.total) * 100 : 0}%`, transition: 'width .5s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#374151', marginBottom: 8 }}>
            <span>👤 Clientes: <b>{analise.clientes_criados || 0}</b></span>
            <span>🎯 Leads: <b>{analise.leads_criados || 0}</b></span>
            <span>↩️ Já conhecidos: <b>{analise.ja_conhecidos || 0}</b></span>
            <span>⚪ Irrelevantes: <b>{analise.irrelevantes || 0}</b></span>
          </div>
          {analise.detalhes?.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 11.5, background: '#fafaf6',
              borderRadius: 8, padding: '8px 12px' }}>
              {analise.detalhes.map((d, i) => (
                <div key={i} style={{ padding: '3px 0', color: '#374151' }}>
                  {d.tipo === 'cliente' ? '👤' : '🎯'} <b>{d.nome}</b> — {d.resumo}
                </div>
              ))}
            </div>
          )}
          {analise.status === 'done' && (
            <button onClick={() => setAnalise(null)}
              style={{ marginTop: 10, padding: '7px 14px', background: '#0f2035', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Fechar
            </button>
          )}
        </div>
      )}

      {/* Modal nova conexão */}
      <Modal open={modalNova} onClose={() => setModalNova(false)} title="Conectar novo número"
        footer={<><Btn variant="outline" onClick={() => setModalNova(false)}>Cancelar</Btn>
          <Btn onClick={criar} disabled={criando}>{criando ? 'Criando...' : 'Criar conexão'}</Btn></>}>
        <FormGrid cols={1}>
          <FormField label="Nome da conexão (identificação interna)">
            <input value={nomeNova} onChange={e => setNomeNova(e.target.value)}
              placeholder='Ex: "thaisa" ou "escritorio"' autoFocus
              onKeyDown={e => e.key === 'Enter' && criar()} />
          </FormField>
          <p style={{ fontSize: 12, color: '#6b6b68', margin: 0 }}>
            Depois de criar, o QR code aparece na tela. No <b>celular do número a conectar</b>:
            WhatsApp → Configurações → <b>Aparelhos conectados</b> → Conectar aparelho → escanear o QR.
          </p>
        </FormGrid>
      </Modal>

      {/* Modal QR code */}
      <Modal open={!!qrDe} onClose={fecharQR} title={`Conectar "${qrDe || ''}"`}
        footer={<Btn variant="outline" onClick={fecharQR}>Fechar</Btn>}>
        <div style={{ textAlign: 'center' }}>
          {qrImg ? (
            <>
              <img src={qrImg} alt="QR code" style={{ width: 260, height: 260, borderRadius: 12 }} />
              <p style={{ fontSize: 13, color: '#374151', margin: '12px 0 4px' }}>
                No celular: <b>WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho</b>
              </p>
              <p style={{ fontSize: 11.5, color: '#9a9a97', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <RefreshCw size={11} /> O QR renova sozinho a cada 15s — a tela avisa quando conectar
              </p>
            </>
          ) : (
            <p style={{ color: '#6b6b68', padding: '2rem 0' }}>Gerando QR code...</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
