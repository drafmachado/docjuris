import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Gavel, ChevronRight, Calendar, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '/api';

function getToken() {
  return localStorage.getItem('docjuris_token');
}

const TIPOS = ['Cível', 'Criminal', 'Trabalhista', 'Família', 'Previdenciário', 'Tributário', 'Administrativo', 'Outro'];
const TRIBUNAIS = ['TJSP', 'TJRJ', 'TJMG', 'TJRS', 'TRF1', 'TRF2', 'TRF3', 'TRT2', 'STJ', 'STF', 'Outro'];

export default function Processos() {
  const [processos, setProcessos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client_id: '', numero_cnj: '', vara: '', comarca: '', tribunal: '', tipo: '', polo_ativo: '', polo_passivo: '', observacoes: '' });
  const [prazosProximos, setPrazosProximos] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProcessos();
    fetchClientes();
    fetchPrazosProximos();
    // Polling automático a cada 3 minutos — atualiza andamentos e prazos
    const interval = setInterval(() => {
      fetchProcessos();
      fetchPrazosProximos();
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchProcessos() {
    const r = await fetch(`${API}/processos`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) setProcessos(await r.json());
  }

  async function fetchClientes() {
    try {
      const r = await fetch(`${API}/clients`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) {
        const d = await r.json();
        const lista = Array.isArray(d) ? d : (d.clients || []);
        setClientes(lista);
      }
    } catch(e) { console.error('fetchClientes erro:', e); }
  }

  async function fetchPrazosProximos() {
    const r = await fetch(`${API}/processos`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) return;
    const todos = await r.json();
    const hoje = new Date();
    const em7dias = new Date(); em7dias.setDate(hoje.getDate() + 7);
    const proximos = [];
    for (const p of todos) {
      const rp = await fetch(`${API}/processos/${p.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!rp.ok) continue;
      const det = await rp.json();
      for (const pz of (det.prazos || [])) {
        if (!pz.concluido) {
          const d = new Date(pz.data_limite + 'T00:00:00');
          if (d <= em7dias) proximos.push({ ...pz, processo_numero: p.numero_cnj, client_nome: p.client_nome });
        }
      }
    }
    proximos.sort((a, b) => new Date(a.data_limite) - new Date(b.data_limite));
    setPrazosProximos(proximos);
  }

  async function handleSubmit() {
    if (!form.client_id || !form.numero_cnj) { toast.error('Cliente e número CNJ são obrigatórios'); return; }
    const r = await fetch(`${API}/processos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      toast.success('Processo cadastrado!');
      setShowModal(false);
      setForm({ client_id: '', numero_cnj: '', vara: '', comarca: '', tribunal: '', tipo: '', polo_ativo: '', polo_passivo: '', observacoes: '' });
      fetchProcessos();
    } else {
      toast.error('Erro ao cadastrar processo');
    }
  }

  const filtered = processos.filter(p => {
    const matchSearch = p.numero_cnj?.toLowerCase().includes(search.toLowerCase()) ||
      p.client_nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.tipo?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
    return matchSearch && matchStatus;
  });

  const hoje = new Date();

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <style>{`
        .procRow { transition: background .15s, border-color .15s, transform .15s; }
        .procRow:hover { background: #fafaf8; border-color: rgba(26,58,92,.2); transform: translateY(-1px); }
      `}</style>

      {/* Alertas de prazos próximos */}
      {prazosProximos.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #fff8f1, #fef3c7)', border: '1px solid #fcd34d', borderRadius: '14px', padding: '16px 18px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 700, color: '#92400e', fontFamily: "'Space Grotesk', sans-serif" }}>
            <AlertCircle size={17} /> {prazosProximos.length} prazo(s) nos próximos 7 dias
          </div>
          {prazosProximos.map(pz => {
            const d = new Date(pz.data_limite + 'T00:00:00');
            const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
            return (
              <div key={pz.id} style={{ fontSize: '13px', color: '#856404', marginBottom: '4px' }}>
                <strong>{pz.titulo}</strong> — {pz.processo_numero} ({pz.client_nome}) —{' '}
                {diff <= 0 ? <span style={{ color: '#dc3545', fontWeight: 700 }}>VENCIDO</span> : `em ${diff} dia(s)`}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#0f2035', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: '-0.02em' }}>Processos</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>{processos.length} processo(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0f2035', color: 'white', border: 'none', borderRadius: '11px', padding: '11px 18px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
          <Plus size={16} /> Novo Processo
        </button>
      </div>

      {/* Filtro de status */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {[['ativo', 'Ativos'], ['arquivado', 'Arquivados'], ['todos', 'Todos']].map(([val, label]) => (
          <button key={val} onClick={() => setFiltroStatus(val)} style={{
            padding: '6px 14px', borderRadius: '20px', border: '1px solid',
            borderColor: filtroStatus === val ? '#0f2035' : '#e5e7eb',
            background: filtroStatus === val ? '#0f2035' : 'white',
            color: filtroStatus === val ? 'white' : '#6b7280',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer'
          }}>{label} {filtroStatus === val && `(${processos.filter(p => val === 'todos' || p.status === val).length})`}</button>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número, cliente ou tipo..." style={{ width: '100%', padding: '11px 12px 11px 38px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', fontSize: '14px', boxSizing: 'border-box', background: '#fbfbf9' }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          <Gavel size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <p>Nenhum processo encontrado</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(p => (
            <div key={p.id} className="procRow" onClick={() => navigate(`/processos/${p.id}`)} style={{ background: 'white', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '14px', padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(26,58,92,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Gavel size={19} color="#1a3a5c" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14.5px', color: '#0f2035', marginBottom: '3px', fontFamily: "'Space Grotesk', sans-serif" }}>{p.numero_cnj}</div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>{p.client_nome} · {p.tipo || 'Sem tipo'} · {p.tribunal || 'Sem tribunal'}</div>
                {p.vara && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{p.vara}{p.comarca ? ` — ${p.comarca}` : ''}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <span style={{ background: p.status === 'ativo' ? '#dcfce7' : '#f3f4f6', color: p.status === 'ativo' ? '#166534' : '#6b7280', fontSize: '11px', padding: '4px 11px', borderRadius: '20px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {p.status}
                </span>
                <ChevronRight size={16} color="#9ca3af" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo processo */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', color: '#0f2035' }}>Novo Processo</h2>

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Cliente *</label>
            <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '12px', fontSize: '14px' }}>
              <option value="">Selecione o cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Número CNJ *</label>
            <input value={form.numero_cnj} onChange={e => setForm(f => ({ ...f, numero_cnj: e.target.value }))} placeholder="0000000-00.0000.0.00.0000" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', boxSizing: 'border-box' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                  <option value="">Selecione</option>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Tribunal</label>
                <select value={form.tribunal} onChange={e => setForm(f => ({ ...f, tribunal: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}>
                  <option value="">Selecione</option>
                  {TRIBUNAIS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Vara</label>
                <input value={form.vara} onChange={e => setForm(f => ({ ...f, vara: e.target.value }))} placeholder="Ex: 3ª Vara Cível" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Comarca</label>
                <input value={form.comarca} onChange={e => setForm(f => ({ ...f, comarca: e.target.value }))} placeholder="Ex: São Paulo" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Polo Ativo</label>
            <input value={form.polo_ativo} onChange={e => setForm(f => ({ ...f, polo_ativo: e.target.value }))} placeholder="Nome do autor/requerente" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', boxSizing: 'border-box' }} />

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Polo Passivo</label>
            <input value={form.polo_passivo} onChange={e => setForm(f => ({ ...f, polo_passivo: e.target.value }))} placeholder="Nome do réu/requerido" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '12px', fontSize: '14px', boxSizing: 'border-box' }} />

            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Observações</label>
            <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={handleSubmit} style={{ padding: '10px 20px', background: '#0f2035', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
