import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, CheckCircle, Circle, Calendar, Gavel, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '/api';
function getToken() { return localStorage.getItem('docjuris_token'); }

const TIPOS_PRAZO = ['Prazo', 'Audiência', 'Petição', 'Recurso', 'Diligência', 'Outro'];

export default function ProcessoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [processo, setProcesso] = useState(null);
  const [showPrazoModal, setShowPrazoModal] = useState(false);
  const [andamentos, setAndamentos] = useState(null);
  const [loadingAndamentos, setLoadingAndamentos] = useState(false);
  const [showAndamentos, setShowAndamentos] = useState(false);
  const [prazoForm, setPrazoForm] = useState({ titulo: '', tipo: 'Prazo', data_limite: '', observacoes: '' });

  useEffect(() => { fetchProcesso(); }, [id]);

  async function buscarAndamentos() {
    setLoadingAndamentos(true);
    setShowAndamentos(true);
    try {
      const r = await fetch(`${API}/processos/${id}/andamentos`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json();
      setAndamentos(d);
    } catch(e) {
      setAndamentos({ erro: 'Erro ao consultar DataJud.' });
    } finally {
      setLoadingAndamentos(false);
    }
  }

  async function fetchProcesso() {
    const r = await fetch(`${API}/processos/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) setProcesso(await r.json());
  }

  async function handleAddPrazo() {
    if (!prazoForm.titulo || !prazoForm.data_limite) { toast.error('Título e data são obrigatórios'); return; }
    const r = await fetch(`${API}/processos/${id}/prazos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(prazoForm),
    });
    if (r.ok) {
      toast.success('Prazo adicionado!');
      setShowPrazoModal(false);
      setPrazoForm({ titulo: '', tipo: 'Prazo', data_limite: '', observacoes: '' });
      fetchProcesso();
    } else toast.error('Erro ao adicionar prazo');
  }

  async function handleTogglePrazo(prazo_id, concluido) {
    await fetch(`${API}/processos/${id}/prazos/${prazo_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ concluido: !concluido }),
    });
    fetchProcesso();
  }

  async function handleDeletePrazo(prazo_id) {
    if (!confirm('Remover este prazo?')) return;
    await fetch(`${API}/processos/${id}/prazos/${prazo_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    toast.success('Prazo removido');
    fetchProcesso();
  }

  async function handleDeleteProcesso() {
    if (!confirm('Excluir este processo? Esta ação não pode ser desfeita.')) return;
    await fetch(`${API}/processos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    toast.success('Processo excluído');
    navigate('/processos');
  }

  if (!processo) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Carregando...</div>;

  const hoje = new Date();
  const prazos = processo.prazos || [];
  const pendentes = prazos.filter(p => !p.concluido);
  const concluidos = prazos.filter(p => p.concluido);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <button onClick={() => navigate('/processos')} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginBottom: '20px', fontSize: '14px' }}>
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Cabeçalho */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Gavel size={18} color="#0f2035" />
              <h1 style={{ margin: 0, fontSize: '18px', color: '#0f2035' }}>{processo.numero_cnj}</h1>
              <span style={{ background: processo.status === 'ativo' ? '#dcfce7' : '#f3f4f6', color: processo.status === 'ativo' ? '#166534' : '#6b7280', fontSize: '12px', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>{processo.status}</span>
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>Cliente: <strong style={{ color: '#0f2035' }}>{processo.client_nome}</strong></div>
          </div>
          <button onClick={handleDeleteProcesso} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {processo.tipo && <div><span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>TIPO</span><span style={{ fontSize: '14px', color: '#374151' }}>{processo.tipo}</span></div>}
          {processo.tribunal && <div><span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>TRIBUNAL</span><span style={{ fontSize: '14px', color: '#374151' }}>{processo.tribunal}</span></div>}
          {processo.vara && <div><span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>VARA</span><span style={{ fontSize: '14px', color: '#374151' }}>{processo.vara}</span></div>}
          {processo.comarca && <div><span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>COMARCA</span><span style={{ fontSize: '14px', color: '#374151' }}>{processo.comarca}</span></div>}
          {processo.polo_ativo && <div><span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>POLO ATIVO</span><span style={{ fontSize: '14px', color: '#374151' }}>{processo.polo_ativo}</span></div>}
          {processo.polo_passivo && <div><span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>POLO PASSIVO</span><span style={{ fontSize: '14px', color: '#374151' }}>{processo.polo_passivo}</span></div>}
        </div>

        {processo.observacoes && (
          <div style={{ marginTop: '12px', padding: '10px', background: '#f9fafb', borderRadius: '6px', fontSize: '13px', color: '#6b7280' }}>{processo.observacoes}</div>
        )}
      </div>

      {/* Prazos */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#0f2035' }}>Prazos e Audiências</h2>
          <button onClick={() => setShowPrazoModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f2035', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>

        {prazos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#9ca3af', fontSize: '14px' }}>
            <Calendar size={32} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }} />
            Nenhum prazo cadastrado
          </div>
        ) : (
          <>
            {pendentes.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>Pendentes</div>
                {pendentes.map(pz => {
                  const d = new Date(pz.data_limite + 'T00:00:00');
                  const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
                  const vencido = diff < 0;
                  const urgente = diff >= 0 && diff <= 3;
                  return (
                    <div key={pz.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', marginBottom: '6px', background: vencido ? '#fff1f2' : urgente ? '#fffbeb' : '#f9fafb', border: `1px solid ${vencido ? '#fecdd3' : urgente ? '#fde68a' : '#e5e7eb'}` }}>
                      <button onClick={() => handleTogglePrazo(pz.id, pz.concluido)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><Circle size={18} /></button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>{pz.titulo}</div>
                        <div style={{ fontSize: '12px', color: vencido ? '#dc2626' : urgente ? '#d97706' : '#6b7280' }}>
                          {pz.tipo} · {d.toLocaleDateString('pt-BR')} · {vencido ? `Vencido há ${Math.abs(diff)} dia(s)` : diff === 0 ? 'Hoje!' : `em ${diff} dia(s)`}
                        </div>
                      </div>
                      <button onClick={() => handleDeletePrazo(pz.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db' }}><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            {concluidos.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>Concluídos</div>
                {concluidos.map(pz => (
                  <div key={pz.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', marginBottom: '6px', background: '#f9fafb', opacity: 0.6 }}>
                    <button onClick={() => handleTogglePrazo(pz.id, pz.concluido)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 0 }}><CheckCircle size={18} /></button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'line-through' }}>{pz.titulo}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{pz.tipo} · {new Date(pz.data_limite + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    <button onClick={() => handleDeletePrazo(pz.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Andamentos DataJud */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#0f2035' }}>Andamentos (DataJud)</h2>
          <button onClick={buscarAndamentos} disabled={loadingAndamentos} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            <RefreshCw size={14} className={loadingAndamentos ? 'spin' : ''} />
            {loadingAndamentos ? 'Consultando...' : 'Consultar CNJ'}
          </button>
        </div>

        {showAndamentos && (
          <div style={{ marginTop: '16px' }}>
            {loadingAndamentos && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>Consultando DataJud...</div>}
            {andamentos?.erro && <div style={{ color: '#ef4444', fontSize: '14px', padding: '10px', background: '#fff1f2', borderRadius: '6px' }}>{andamentos.erro}</div>}
            {andamentos && !andamentos.erro && (
              <>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                  {andamentos.classe && <span style={{ marginRight: '12px' }}>Classe: <strong>{andamentos.classe}</strong></span>}
                  {andamentos.assunto && <span>Assunto: <strong>{andamentos.assunto}</strong></span>}
                  <span style={{ marginLeft: '12px' }}>Total: <strong>{andamentos.totalMovimentos} movimentos</strong></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(andamentos.movimentos || []).map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px', background: '#f9fafb', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{new Date(m.data).toLocaleDateString('pt-BR')}</span>
                      <span style={{ color: '#374151' }}>{m.descricao}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal prazo */}}
      {showPrazoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '440px' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', color: '#0f2035' }}>Novo Prazo</h2>

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Título *</label>
            <input value={prazoForm.titulo} onChange={e => setPrazoForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Contestação, Audiência de instrução..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', boxSizing: 'border-box' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Tipo</label>
                <select value={prazoForm.tipo} onChange={e => setPrazoForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                  {TIPOS_PRAZO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Data *</label>
                <input type="date" value={prazoForm.data_limite} onChange={e => setPrazoForm(f => ({ ...f, data_limite: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Observações</label>
            <textarea value={prazoForm.observacoes} onChange={e => setPrazoForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPrazoModal(false)} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={handleAddPrazo} style={{ padding: '10px 20px', background: '#0f2035', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
