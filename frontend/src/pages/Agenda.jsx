import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Calendar, AlertCircle, Clock, CheckCircle2, ChevronRight } from 'lucide-react';

const GRUPOS = [
  { id: 'vencidos', label: 'Vencidos', cor: '#991b1b', bg: '#fef2f2', borda: '#fca5a5', icon: '🔴' },
  { id: 'hoje',     label: 'Hoje',     cor: '#b45309', bg: '#fff8f1', borda: '#fcd34d', icon: '🟠' },
  { id: 'semana',   label: 'Esta semana (7 dias)', cor: '#1e40af', bg: '#eff6ff', borda: '#93c5fd', icon: '🔵' },
  { id: 'mes',      label: 'Este mês (30 dias)',   cor: '#3b6d11', bg: '#f0fdf4', borda: '#bbf7d0', icon: '🟢' },
  { id: 'depois',   label: 'Mais adiante',          cor: '#6b7280', bg: '#fafafa', borda: '#e5e7eb', icon: '⚪' },
];

const fmtData = d => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const labelDias = dias => {
  if (dias < 0) return `${Math.abs(dias)} dia(s) atrás`;
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return `Em ${dias} dias`;
};

export default function Agenda() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    try { const r = await api.get('/agenda'); setDados(r.data); }
    catch { toast.error('Erro ao carregar agenda'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const concluir = async (id, e) => {
    e.stopPropagation();
    try {
      await api.put(`/agenda/${id}/concluir`, { concluido: true });
      toast.success('Prazo concluído!');
      load();
    } catch { toast.error('Erro ao concluir'); }
  };

  if (loading) return <div style={{ textAlign:'center', padding:'3rem', color:'#6b6b68' }}>Carregando agenda...</div>;
  if (!dados) return <div style={{ textAlign:'center', padding:'3rem', color:'#ef4444' }}>Erro ao carregar</div>;

  const { grupos, resumo, total } = dados;

  return (
    <div style={{ maxWidth: 850, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <style>{`
        .prazoRow { transition: transform .15s, box-shadow .15s; }
        .prazoRow:hover { transform: translateX(2px); box-shadow: 0 4px 14px rgba(0,0,0,.06); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f2035', margin: 0, display:'flex', alignItems:'center', gap:10, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
          <Calendar size={24} color="#c5a859" /> Agenda de Prazos
        </h2>
        <p style={{ fontSize: 13, color: '#6b6b68', margin: '4px 0 0' }}>
          {total} prazo(s) em aberto · tudo num só lugar
        </p>
      </div>

      {/* Resumo rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.75rem' }}>
        {[
          { label: 'Vencidos', n: resumo.vencidos, cor: '#991b1b', bg: '#fef2f2' },
          { label: 'Hoje', n: resumo.hoje, cor: '#b45309', bg: '#fff8f1' },
          { label: 'Esta semana', n: resumo.semana, cor: '#1e40af', bg: '#eff6ff' },
          { label: 'Este mês', n: resumo.mes, cor: '#3b6d11', bg: '#f0fdf4' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 700, color: k.cor }}>{k.n}</div>
            <div style={{ fontSize: 11.5, color: k.cor, fontWeight: 600, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Grupos de prazos */}
      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b6b68', background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)' }}>
          <CheckCircle2 size={40} color="#bbf7d0" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0f2035' }}>Nenhum prazo em aberto</p>
          <p style={{ fontSize: 13 }}>Tudo em dia! Os prazos aparecem aqui automaticamente quando detectados.</p>
        </div>
      ) : (
        GRUPOS.map(g => {
          const itens = grupos[g.id] || [];
          if (itens.length === 0) return null;
          return (
            <div key={g.id} style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>{g.icon}</span>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: g.cor, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {g.label}
                </h3>
                <span style={{ fontSize: 12, color: '#999', background: '#f0f0ec', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>{itens.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itens.map(p => (
                  <div key={p.id} className="prazoRow"
                    onClick={() => navigate(`/processos/${p.processo_id}`)}
                    style={{ background: '#fff', border: `1px solid ${g.borda}`, borderLeft: `4px solid ${g.cor}`,
                      borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f2035', marginBottom: 3 }}>{p.titulo}</div>
                      <div style={{ fontSize: 12.5, color: '#6b7280' }}>
                        {p.cliente_nome} · {p.numero_cnj} · {p.tribunal || 'Sem tribunal'}
                      </div>
                      {p.observacoes && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3, fontStyle: 'italic' }}>{p.observacoes.substring(0, 90)}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: g.cor }}>{labelDias(p.dias_restantes)}</div>
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{fmtData(p.data_limite)}</div>
                    </div>
                    <button onClick={(e) => concluir(p.id, e)}
                      title="Marcar como concluído"
                      style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <CheckCircle2 size={16} color="#3b6d11" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
