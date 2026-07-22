// Quadro de Andamento — visão Trello dos processos: colunas = etapas da esteira.
// Importação direta do JSON exportado do Trello (o navegador filtra o arquivo).
import { useState, useEffect, useRef } from 'react';
import { Topbar, Btn, Modal, FormField, FormGrid } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Settings2, UploadCloud, Plus, Trash2, CalendarClock, ArrowUp, ArrowDown } from 'lucide-react';

const CORES_TRELLO = {
  green: '#4bce97', yellow: '#f5cd47', orange: '#fea362', red: '#f87168', purple: '#9f8fef',
  blue: '#579dff', sky: '#6cc3e0', lime: '#94c748', pink: '#e774bb', black: '#8590a2',
  green_dark: '#1f845a', yellow_dark: '#946f00', orange_dark: '#c25100', red_dark: '#c9372c',
  purple_dark: '#6e5dc6', blue_dark: '#0c66e4', sky_dark: '#227d9b', lime_dark: '#5b7f24',
  pink_dark: '#ae4787', black_dark: '#626f86',
  green_light: '#baf3db', yellow_light: '#f8e6a0', orange_light: '#fedec8', red_light: '#ffd5d2',
  purple_light: '#dfd8fd', blue_light: '#cce0ff', sky_light: '#c6edfb', lime_light: '#d3f1a7',
  pink_light: '#fdd0ec', black_light: '#dcdfe4',
};
function corLabel(cor) { return CORES_TRELLO[cor] || '#8590a2'; }
function corTextoLabel(cor) { return (cor || '').includes('light') || ['yellow','lime','sky'].includes(cor) ? '#172b4d' : '#fff'; }

function fmtData(d) { try { return new Date((d||'').slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }); } catch { return d; } }

export default function KanbanProcessos() {
  const nav = useNavigate();
  const [etapas, setEtapas] = useState([]);
  const [processos, setProcessos] = useState([]);
  const [gerenciar, setGerenciar] = useState(false);
  const [novaEtapa, setNovaEtapa] = useState('');
  const [importando, setImportando] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    api.get('/processos/etapas').then(r => setEtapas(r.data)).catch(() => {});
    api.get('/processos/quadro').then(r => setProcessos(r.data)).catch(() => {});
  };
  useEffect(load, []);

  async function mover(p, direcao) {
    const ids = etapas.map(e => e.id);
    const atual = ids.indexOf(p.etapa_id);
    const novo = atual === -1 ? (direcao > 0 ? ids[0] : null) : ids[atual + direcao];
    if (novo === undefined) return;
    setProcessos(prev => prev.map(x => x.id === p.id ? { ...x, etapa_id: novo ?? null } : x));
    try { await api.put(`/processos/${p.id}/etapa`, { etapa_id: novo ?? null }); }
    catch { toast.error('Erro ao mover'); load(); }
  }

  async function criarEtapa() {
    if (!novaEtapa.trim()) return;
    try { await api.post('/processos/etapas', { nome: novaEtapa }); setNovaEtapa(''); load(); }
    catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  }
  async function renomearEtapa(et) {
    const nome = window.prompt('Novo nome da etapa:', et.nome);
    if (!nome || nome === et.nome) return;
    try { await api.put(`/processos/etapas/${et.id}`, { nome }); load(); } catch { toast.error('Erro'); }
  }
  async function excluirEtapa(et) {
    if (!window.confirm(`Excluir a etapa "${et.nome}"?`)) return;
    try { await api.delete(`/processos/etapas/${et.id}`); load(); }
    catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  }
  async function reordenar(et, dir) {
    const idx = etapas.findIndex(e => e.id === et.id);
    const alvo = etapas[idx + dir];
    if (!alvo) return;
    try {
      await api.put(`/processos/etapas/${et.id}`, { ordem: alvo.ordem });
      await api.put(`/processos/etapas/${alvo.id}`, { ordem: et.ordem });
      load();
    } catch { toast.error('Erro ao reordenar'); }
  }

  // ─── Importação do Trello: lê o JSON no navegador e envia só o essencial ───
  function importarTrello(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportando(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const bruto = JSON.parse(reader.result);
        const lists = (bruto.lists || []).filter(l => !l.closed).map(l => ({ id: l.id, nome: l.name }));
        // Comentários por cartão (das actions do export)
        const comentariosPorCard = {};
        for (const a of (bruto.actions || [])) {
          if (a.type === 'commentCard' && a.data?.card?.id) {
            (comentariosPorCard[a.data.card.id] ||= []).push({
              texto: (a.data.text || '').slice(0, 500), data: a.date,
            });
          }
        }
        const cards = (bruto.cards || []).filter(cd => !cd.closed).map(cd => ({
          name: cd.name, desc: (cd.desc || '').slice(0, 2000), idList: cd.idList, due: cd.due,
          labels: (cd.labels || []).map(lb => ({ name: lb.name || '', color: lb.color || '' })),
          comentarios: comentariosPorCard[cd.id] || [],
        }));
        if (lists.length === 0 && cards.length === 0) throw new Error('Arquivo não parece um export do Trello');

        toast(`Enviando ${cards.length} cartões em ${lists.length} colunas...`, { icon: '📦' });
        const r = await api.post('/processos/importar-trello', { lists, cards }, { timeout: 120000 });
        const d = r.data;
        toast.success(
          `Importado! ${d.etapas_criadas} etapa(s) nova(s), ${d.vinculados} processo(s) vinculado(s), ` +
          `${d.criados_triagem} criado(s) na triagem, ${d.prazos_criados} prazo(s).` +
          (d.sem_cnj.length ? ` ${d.sem_cnj.length} cartão(ões) sem número CNJ ignorado(s).` : ''),
          { duration: 9000 }
        );
        if (d.sem_cnj.length) console.log('Cartões sem CNJ:', d.sem_cnj);
        load();
      } catch(e) {
        toast.error(e.response?.data?.error || e.message || 'Erro na importação');
      } finally {
        setImportando(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  const semEtapa = processos.filter(p => !p.etapa_id || !etapas.some(e => e.id === p.etapa_id));

  const Card = ({ p, colIdx }) => (
    <div onClick={() => nav(`/processos/${p.id}`)} style={{
      background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: 'pointer',
    }}>
      {p.trello_labels && (() => {
        try {
          const labels = JSON.parse(p.trello_labels);
          if (!labels.length) return null;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
              {labels.slice(0, 4).map((lb, i) => (
                <span key={i} style={{ background: corLabel(lb.color), color: corTextoLabel(lb.color),
                  borderRadius: 4, padding: '1px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.02em' }}>
                  {lb.name || '   '}
                </span>
              ))}
            </div>
          );
        } catch { return null; }
      })()}
      <div style={{ fontWeight: 700, fontSize: 12, color: '#0f2035' }}>{p.numero_cnj}</div>
      <div style={{ fontSize: 11.5, color: '#6b6b68', margin: '2px 0 6px' }}>
        {p.cliente_nome?.split(' ').slice(0, 3).join(' ') || 'sem cliente'} · {p.tribunal}
      </div>
      {p.ultima_mov && (
        <div style={{ fontSize: 10.5, color: '#9a9a97', marginBottom: 6, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {fmtData(p.ultima_mov_data)}: {p.ultima_mov}
        </div>
      )}
      {p.proximo_prazo && (
        <div style={{ fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3,
          color: p.proximo_prazo < new Date().toISOString().slice(0,10) ? '#a32d2d' : '#854f0b' }}>
          <CalendarClock size={11} /> prazo: {fmtData(p.proximo_prazo)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginTop: 7 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => mover(p, -1)}
          style={{ background: '#f0f4ff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex' }}>
          <ChevronLeft size={12} color="#185fa5" />
        </button>
        <button onClick={() => mover(p, 1)}
          style={{ background: '#eaf3de', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex' }}>
          <ChevronRight size={12} color="#3b6d11" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <Topbar title="Andamento">
        <input type="file" accept=".json,application/json" ref={fileRef} onChange={importarTrello} style={{ display: 'none' }} />
        <Btn variant="outline" onClick={() => fileRef.current?.click()} disabled={importando} style={{ marginRight: 8 }}>
          <UploadCloud size={14} /> {importando ? 'Importando...' : 'Importar do Trello'}
        </Btn>
        <Btn variant="outline" onClick={() => setGerenciar(true)}><Settings2 size={14} /> Etapas</Btn>
      </Topbar>

      {etapas.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#6b6b68' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f2035', marginBottom: 6 }}>Seu quadro está vazio</p>
          <p style={{ fontSize: 13 }}>Importe seu quadro do Trello (botão acima) — as colunas e cartões chegam prontos.<br/>
          Ou crie as etapas manualmente em "Etapas".</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>
        {semEtapa.length > 0 && etapas.length > 0 && (
          <div style={{ minWidth: 250, maxWidth: 270, background: '#f3f1e8', borderRadius: 12, padding: '10px 8px', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: '#854f0b', padding: '0 6px', marginBottom: 8 }}>
              📥 Sem etapa ({semEtapa.length})
            </div>
            {semEtapa.map(p => <Card key={p.id} p={p} colIdx={-1} />)}
          </div>
        )}
        {etapas.map((et, i) => {
          const itens = processos.filter(p => p.etapa_id === et.id);
          return (
            <div key={et.id} style={{ minWidth: 250, maxWidth: 270, background: '#f0efe8', borderRadius: 12, padding: '10px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: '#0d2340' }}>{et.nome}</span>
                <span style={{ background: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: '#6b6b68' }}>{itens.length}</span>
              </div>
              {itens.map(p => <Card key={p.id} p={p} colIdx={i} />)}
              {itens.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: 11.5, color: '#9a9a97' }}>vazio</div>}
            </div>
          );
        })}
      </div>

      <Modal open={gerenciar} onClose={() => setGerenciar(false)} title="Gerenciar etapas do quadro"
        footer={<Btn onClick={() => setGerenciar(false)}>Fechar</Btn>}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
            placeholder="Nome da nova etapa" onKeyDown={e => e.key === 'Enter' && criarEtapa()}
            style={{ flex: 1 }} />
          <Btn onClick={criarEtapa}><Plus size={14} /> Criar</Btn>
        </div>
        {etapas.map((et, i) => (
          <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            background: '#fafaf6', borderRadius: 8, marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => renomearEtapa(et)} title="Clique para renomear">{et.nome}</span>
            <span style={{ fontSize: 11, color: '#9a9a97' }}>{et.processos} proc.</span>
            <button onClick={() => reordenar(et, -1)} disabled={i === 0}
              style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', display: 'flex' }}>
              <ArrowUp size={13} color={i === 0 ? '#ddd' : '#6b6b68'} />
            </button>
            <button onClick={() => reordenar(et, 1)} disabled={i === etapas.length - 1}
              style={{ background: 'none', border: 'none', cursor: i === etapas.length - 1 ? 'default' : 'pointer', display: 'flex' }}>
              <ArrowDown size={13} color={i === etapas.length - 1 ? '#ddd' : '#6b6b68'} />
            </button>
            <button onClick={() => excluirEtapa(et)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
              <Trash2 size={13} color="#a32d2d" />
            </button>
          </div>
        ))}
      </Modal>
    </div>
  );
}
