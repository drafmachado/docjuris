import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Calendar, AlertCircle, Check, ChevronRight, Clock } from 'lucide-react';

const GRUPOS = [
  { id: 'vencido', label: 'Vencidos', cor: '#991b1b', bg: '#fee2e2', borda: '#fca5a5' },
  { id: 'critico', label: 'Críticos — até 2 dias', cor: '#b45309', bg: '#fff8f1', borda: '#fcd34d' },
  { id: 'proximo', label: 'Próximos 7 dias', cor: '#1e40af', bg: '#eff6ff', borda: '#bfdbfe' },
  { id: 'normal',  label: 'Mais adiante', cor: '#475569', bg: '#f8fafc', borda: '#e2e8f0' },
];

function fmtData(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function diaSemana(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long' });
}
function textoDias(dias) {
  if (dias < 0) return `${Math.abs(dias)} dia(s) atrás`;
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return `em ${dias} dias`;
}

export default function AgendaPrazos() {
  const [prazos, setPrazos] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const r = await api.get('/processos/agenda-prazos');
      setPrazos(r.data || []);
    } catch { toast.error('Erro ao carregar prazos'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const concluir = async (e, prazoId) => {
    e.stopPropagation();
    if (!window.confirm('Marcar este prazo como cumprido? Ele sairá da agenda.')) return;
    try {
      await api.put(`/processos/prazos/${prazoId}/concluir`);
      toast.success('Prazo concluído!');
      load();
    } catch { toast.error('Erro ao concluir'); }
  };

  const porGrupo = id => prazos.filter(p => p.urgencia === id);
  const totalAtivos = prazos.length;
  const vencidos = porGrupo('vencido').length;
  const criticos = porGrupo('critico').length;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <style>{`
        .prazoCard { transition: transform .15s, box-shadow .15s; }
        .prazoCard:hover { transform: translateX(3px); box-shadow: 0 4px 14px rgba(0,0,0,.07); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f2035', margin: 0, display: 'flex', alignItems: 'center', gap: 9, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
          <Calendar size={22} color="#c5a859" /> Agenda de Prazos
        </h2>
        <p style={{ fontSize: 13, color: '#6b6b68', margin: '4px 0 0' }}>
          Todos os prazos e audiências em aberto, ordenados por urgência
        </p>
      </div>

      {/* Resumo rápido */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 130, background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Em aberto</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: '#0f2035' }}>{totalAtivos}</div>
        </div>
        <div style={{ flex: 1, minWidth: 130, background: vencidos > 0 ? '#fee2e2' : '#fff', border: `1px solid ${vencidos > 0 ? '#fca5a5' : 'rgba(0,0,0,.07)'}`, borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: vencidos > 0 ? '#991b1b' : '#999', fontWeight: 500 }}>Vencidos</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: vencidos > 0 ? '#991b1b' : '#0f2035' }}>{vencidos}</div>
        </div>
        <div style={{ flex: 1, minWidth: 130, background: criticos > 0 ? '#fff8f1' : '#fff', border: `1px solid ${criticos > 0 ? '#fcd34d' : 'rgba(0,0,0,.07)'}`, borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: criticos > 0 ? '#b45309' : '#999', fontWeight: 500 }}>Críticos (até 2d)</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: criticos > 0 ? '#b45309' : '#0f2035' }}>{criticos}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b6b68' }}>Carregando...</div>
      ) : totalAtivos === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <p style={{ color: '#0f2035', fontWeight: 600, margin: 0 }}>Nenhum prazo em aberto</p>
          <p style={{ color: '#999', fontSize: 13, margin: '4px 0 0' }}>Todos os prazos estão em dia.</p>
        </div>
      ) : (
        GRUPOS.map(g => {
          const itens = porGrupo(g.id);
          if (itens.length === 0) return null;
          return (
            <div key={g.id} style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: g.cor, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Space Grotesk', sans-serif" }}>
                  {g.label}
                </span>
                <span style={{ background: g.bg, color: g.cor, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>{itens.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itens.map(p => (
                  <div key={p.id} className="prazoCard"
                    onClick={() => navigate(`/processos/${p.processo_id}`)}
                    style={{ background: '#fff', border: `1px solid ${g.borda}`, borderLeft: `4px solid ${g.cor}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Data */}
                    <div style={{ textAlign: 'center', minWidth: 64, flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: g.cor }}>{fmtData(p.data_limite)}</div>
                      <div style={{ fontSize: 11, color: g.cor, fontWeight: 600 }}>{textoDias(p.dias_restantes)}</div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(0,0,0,.08)' }} />
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f2035', marginBottom: 2 }}>{p.titulo}</div>
                      <div style={{ fontSize: 12.5, color: '#6b7280' }}>
                        {p.cliente_nome} · {p.numero_cnj} · {p.tribunal || 'Sem tribunal'}
                      </div>
                      {p.observacoes && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3 }}>{p.observacoes.substring(0, 90)}{p.observacoes.length > 90 ? '...' : ''}</div>}
                    </div>
                    {/* Ações */}
                    <button onClick={(e) => concluir(e, p.id)} title="Marcar como cumprido"
                      style={{ background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 9, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={16} />
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
