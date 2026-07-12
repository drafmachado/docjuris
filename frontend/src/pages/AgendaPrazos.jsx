// Agenda de Prazos — rotina central das advogadas.
// Vencidos SEMPRE visíveis, alertas por criticidade, última movimentação fixa
// em cada prazo, sincronização automática (6h) + botão de atualização manual.
import { useState, useEffect } from 'react';
import { Topbar, Badge, EmptyState } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { RefreshCw, CheckCircle2, CalendarClock, Gavel, AlertTriangle } from 'lucide-react';

const GRUPOS = [
  { id: 'vencido', titulo: 'VENCIDOS — ação imediata',   cor: '#a32d2d', bg: '#fdf2f2', borda: '#dc2626' },
  { id: 'critico', titulo: 'CRÍTICOS — até 3 dias',      cor: '#b45309', bg: '#fff7ed', borda: '#f59e0b' },
  { id: 'proximo', titulo: 'PRÓXIMOS — até 7 dias',      cor: '#854f0b', bg: '#fefce8', borda: '#eab308' },
  { id: 'normal',  titulo: 'FUTUROS',                    cor: '#185fa5', bg: '#f8fafc', borda: '#cbd5e1' },
];

function fmtData(d) { try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } }
function fmtDataHora(d) {
  try { return new Date(d.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch { return d; }
}
function fmtMovData(d) {
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return (d||'').slice(0,10); }
}

export default function AgendaPrazos() {
  const [prazos, setPrazos] = useState([]);
  const [sync, setSync] = useState(null);
  const [ativos, setAtivos] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const load = async () => {
    try {
      const r = await api.get('/processos/agenda-prazos');
      // Compatível com formato novo { prazos, ultima_sincronizacao } e antigo (array)
      if (Array.isArray(r.data)) { setPrazos(r.data); }
      else {
        setPrazos(r.data.prazos || []);
        setSync(r.data.ultima_sincronizacao);
        setAtivos(r.data.processos_ativos || 0);
      }
    } catch {} finally { setCarregado(true); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 2 * 60 * 1000); // auto-atualiza a cada 2 min
    return () => clearInterval(interval);
  }, []);

  const concluir = async (e, prazoId) => {
    e.stopPropagation();
    try {
      await api.put(`/processos/prazos/${prazoId}/concluir`);
      setPrazos(prev => prev.filter(p => p.id !== prazoId));
      toast.success('Prazo concluído!');
    } catch { toast.error('Erro ao concluir'); }
  };

  const atualizarAgora = async () => {
    setAtualizando(true);
    try {
      const r = await api.post('/processos/monitorar-agora');
      if (r.data.ja_rodando) toast('Sincronização já em andamento — aguarde alguns minutos', { icon: '⏳' });
      else toast.success(`Sincronização iniciada (${ativos} processos ativos). Os dados chegam em ~2 min.`);
      // Recarrega algumas vezes enquanto o ciclo roda
      setTimeout(load, 60 * 1000);
      setTimeout(load, 150 * 1000);
    } catch { toast.error('Erro ao iniciar sincronização'); }
    finally { setTimeout(() => setAtualizando(false), 4000); }
  };

  const porGrupo = id => prazos.filter(p => p.urgencia === id);
  const totalVencCrit = porGrupo('vencido').length + porGrupo('critico').length;

  return (
    <div>
      <Topbar title="Agenda de Prazos">
        <button onClick={atualizarAgora} disabled={atualizando}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: atualizando ? '#e5e7eb' : '#0f2035',
            color: atualizando ? '#6b7280' : '#fff', border: 'none', borderRadius: 10, padding: '9px 16px',
            fontSize: 13, fontWeight: 700, cursor: atualizando ? 'not-allowed' : 'pointer' }}>
          <RefreshCw size={14} className={atualizando ? 'girando' : ''} />
          {atualizando ? 'Sincronizando...' : 'Atualizar agora'}
        </button>
      </Topbar>

      {/* Barra de status da sincronização */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        background: '#fff', borderRadius: 12, padding: '10px 16px', marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)', fontSize: 12.5, color: '#6b6b68' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Gavel size={13} color="#c5a859" /> <b style={{ color: '#0f2035' }}>{ativos}</b> processos ativos monitorados
        </span>
        <span>•</span>
        <span>
          Última sincronização: <b style={{ color: '#0f2035' }}>{sync ? fmtDataHora(sync) : 'aguardando primeiro ciclo'}</b>
          {' '}(automática a cada 6h)
        </span>
        {totalVencCrit > 0 && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            background: '#fdf2f2', color: '#a32d2d', borderRadius: 20, padding: '3px 12px', fontWeight: 700 }}>
            <AlertTriangle size={13} /> {totalVencCrit} prazo(s) exigindo atenção
          </span>
        )}
      </div>

      {carregado && prazos.length === 0 && (
        <EmptyState icon="📅" title="Nenhum prazo em aberto"
          subtitle="Prazos criados manualmente ou detectados pela IA nos andamentos aparecem aqui" />
      )}

      {GRUPOS.map(g => {
        const itens = porGrupo(g.id);
        if (itens.length === 0) return null;
        return (
          <div key={g.id} style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: g.cor, letterSpacing: '0.06em', marginBottom: 8 }}>
              {g.titulo} ({itens.length})
            </h3>
            {itens.map(p => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '13px 16px',
                marginBottom: 8, borderLeft: `4px solid ${g.borda}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a18' }}>{p.titulo}</div>
                    <div style={{ fontSize: 12, color: '#6b6b68', marginTop: 2 }}>
                      {p.cliente_nome} · {p.numero_cnj} ({p.tribunal})
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: g.cor }}>
                        {p.urgencia === 'vencido'
                          ? `VENCIDO há ${Math.abs(p.dias_restantes)} dia(s)`
                          : p.dias_restantes === 0 ? 'VENCE HOJE'
                          : `${p.dias_restantes} dia(s)`}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#9a9a97' }}>
                        <CalendarClock size={11} style={{ verticalAlign: '-2px' }} /> {fmtData(p.data_limite)}
                      </div>
                    </div>
                    <button onClick={(e) => concluir(e, p.id)} title="Marcar como cumprido"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#eaf3de',
                        color: '#3b6d11', border: 'none', borderRadius: 8, padding: '7px 12px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <CheckCircle2 size={13} /> Concluir
                    </button>
                  </div>
                </div>

                {/* Última movimentação — fixa no cartão */}
                {p.ult_mov_descricao && (
                  <div style={{ marginTop: 9, background: '#fafaf6', borderRadius: 8, padding: '7px 11px',
                    fontSize: 12, color: '#374151', display: 'flex', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: '#9a9a97', flexShrink: 0, fontSize: 10.5, letterSpacing: '0.05em' }}>
                      ÚLTIMA MOVIMENTAÇÃO · {fmtMovData(p.ult_mov_data)}
                    </span>
                    <span>{p.ult_mov_descricao}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <style>{`.girando { animation: girar 1.2s linear infinite; } @keyframes girar { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
