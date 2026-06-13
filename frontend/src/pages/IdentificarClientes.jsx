import { useState, useEffect } from 'react';
import { Search, Save, CheckCircle, Users, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '/api';
function getToken() { return localStorage.getItem('docjuris_token'); }

export default function IdentificarClientes() {
  const [processos, setProcessos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [nomes, setNomes] = useState({});
  const [sugestoes, setSugestoes] = useState({});
  const [salvando, setSalvando] = useState({});
  const [search, setSearch] = useState('');
  const [concluidos, setConcluidos] = useState({});

  useEffect(() => {
    fetchProcessos();
    fetchClientes();
  }, []);

  async function fetchProcessos() {
    const r = await fetch(`${API}/processos`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) return;
    const todos = await r.json();
    const pendentes = todos.filter(p => p.client_nome === 'A IDENTIFICAR');
    setProcessos(pendentes);
  }

  async function fetchClientes() {
    const r = await fetch(`${API}/clients`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) return;
    const d = await r.json();
    setClientes(Array.isArray(d) ? d : (d.clients || []));
  }

  function handleNomeChange(id, valor) {
    setNomes(n => ({ ...n, [id]: valor }));
    // Sugestões de clientes existentes
    if (valor.length >= 2) {
      const matches = clientes.filter(c =>
        c.nome !== 'A IDENTIFICAR' &&
        c.nome.toLowerCase().includes(valor.toLowerCase())
      ).slice(0, 4);
      setSugestoes(s => ({ ...s, [id]: matches }));
    } else {
      setSugestoes(s => ({ ...s, [id]: [] }));
    }
  }

  function selecionarSugestao(id, nome) {
    setNomes(n => ({ ...n, [id]: nome }));
    setSugestoes(s => ({ ...s, [id]: [] }));
  }

  async function salvarCliente(processo) {
    const nome = nomes[processo.id]?.trim();
    if (!nome) { toast.error('Digite o nome do cliente'); return; }

    setSalvando(s => ({ ...s, [processo.id]: true }));
    try {
      // Criar ou buscar cliente
      const rc = await fetch(`${API}/clients`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const todos = await rc.json();
      const lista = Array.isArray(todos) ? todos : (todos.clients || []);
      let cliente = lista.find(c => c.nome.toLowerCase() === nome.toLowerCase());

      if (!cliente) {
        const rn = await fetch(`${API}/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ nome }),
        });
        if (rn.ok) {
          const d = await rn.json();
          cliente = { id: d.id || d.client?.id };
        }
      }

      if (!cliente?.id) { toast.error('Erro ao criar cliente'); return; }

      // Atualizar processo
      await fetch(`${API}/processos/${processo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          numero_cnj: processo.numero_cnj,
          vara: processo.vara,
          comarca: processo.comarca,
          tribunal: processo.tribunal,
          tipo: processo.tipo,
          polo_ativo: nome,
          polo_passivo: processo.polo_passivo,
          observacoes: processo.observacoes,
          status: processo.status,
          client_id: cliente.id,
        }),
      });

      setConcluidos(c => ({ ...c, [processo.id]: nome }));
      toast.success(`${nome} vinculado!`);
      fetchClientes();
    } catch(e) {
      toast.error('Erro ao salvar');
    } finally {
      setSalvando(s => ({ ...s, [processo.id]: false }));
    }
  }

  const pendentes = processos.filter(p =>
    !concluidos[p.id] &&
    (p.numero_cnj?.includes(search) || p.tipo?.toLowerCase().includes(search.toLowerCase()) || p.vara?.toLowerCase().includes(search.toLowerCase()))
  );
  const done = processos.filter(p => concluidos[p.id]);

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '22px', color: '#0f2035' }}>Identificar Clientes</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          {pendentes.length} processo(s) aguardando identificação · {done.length} concluído(s) nesta sessão
        </p>
      </div>

      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar por número, assunto ou vara..."
          style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
      </div>

      {pendentes.length === 0 && done.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          <Users size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
          <p>Nenhum processo pendente de identificação.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pendentes.map(p => (
          <div key={p.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f2035', marginBottom: '2px' }}>{p.numero_cnj}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.tipo}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.vara}{p.comarca ? ` · ${p.comarca}` : ''}</div>
              </div>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <input
                  value={nomes[p.id] || ''}
                  onChange={e => handleNomeChange(p.id, e.target.value)}
                  placeholder="Nome do cliente..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                  onKeyDown={e => { if (e.key === 'Enter') salvarCliente(p); }}
                />
                {sugestoes[p.id]?.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {sugestoes[p.id].map(c => (
                      <div key={c.id} onClick={() => selecionarSugestao(p.id, c.nome)}
                        style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}
                        onMouseEnter={e => e.target.style.background = '#f3f4f6'}
                        onMouseLeave={e => e.target.style.background = 'white'}>
                        {c.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => salvarCliente(p)} disabled={salvando[p.id]}
                style={{ background: '#0f2035', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {salvando[p.id] ? '...' : <><Save size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />Salvar</>}
              </button>
            </div>
          </div>
        ))}

        {done.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>Identificados nesta sessão</div>
            {done.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '6px' }}>
                <CheckCircle size={16} color="#22c55e" />
                <span style={{ fontSize: '13px', color: '#166534', fontWeight: 500 }}>{concluidos[p.id]}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: 'auto' }}>{p.numero_cnj}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
