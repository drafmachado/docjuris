// Quadro de Andamento — visão Trello dos processos: colunas = etapas da esteira.
// Importação direta do JSON exportado do Trello (o navegador filtra o arquivo).
import { useState, useEffect, useRef } from 'react';
import { Topbar, Btn, Modal, FormField, FormGrid } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Settings2, UploadCloud, Plus, Trash2, CalendarClock, ArrowUp, ArrowDown, Search, Tag, X, Users } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect.jsx';
import CardModal from './CardModal.jsx';

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
  const quadroRef = useRef(null);
  const [alturaQuadro, setAlturaQuadro] = useState('70vh');
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [catalogoEtiquetas, setCatalogoEtiquetas] = useState([]);
  const [modalNovo, setModalNovo] = useState(null);        // etapa_id do "+" clicado
  const [novoCard, setNovoCard] = useState({ titulo: '', client_id: '' });
  const [modalEtiquetas, setModalEtiquetas] = useState(null); // processo em edição
  const [etiquetasSel, setEtiquetasSel] = useState([]);
  const [novaEtiqueta, setNovaEtiqueta] = useState({ name: '', color: 'blue' });
  const [cardAberto, setCardAberto] = useState(null); // { id, etapaNome }
  const [modalTriagem, setModalTriagem] = useState(false);
  const [triagem, setTriagem] = useState(null);
  const [selecao, setSelecao] = useState({});   // processo_id → { client_id | criar_nome, telefone }
  const [aplicandoTriagem, setAplicandoTriagem] = useState(false);

  async function abrirTriagem() {
    setModalTriagem(true); setTriagem(null);
    try {
      const r = await api.get('/processos/triagem-sugestoes', { timeout: 90000 });
      setTriagem(r.data);
      // Pré-seleciona as sugestões com boa confiança
      const pre = {};
      for (const s of r.data.processos) {
        const top = (s.whatsapp_sugestoes || [])[0];
        if (s.cliente_sugerido && s.cliente_sugerido.score >= 75) {
          // Telefone só entra junto se o match do contato também for forte
          pre[s.processo_id] = { client_id: s.cliente_sugerido.id, telefone: (top && top.score >= 75) ? top.numero : null };
        } else if (top && top.score >= 75) {
          pre[s.processo_id] = { criar_nome: top.nome || s.nome_extraido, telefone: top.numero };
        }
      }
      setSelecao(pre);
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao cruzar dados'); setModalTriagem(false); }
  }

  async function aplicarTriagem() {
    const itens = Object.entries(selecao).filter(([, v]) => v).map(([pid, v]) => ({ processo_id: Number(pid), ...v }));
    if (!itens.length) return toast.error('Marque ao menos um processo');
    if (!window.confirm(`Aplicar ${itens.length} vinculação(ões)?`)) return;
    setAplicandoTriagem(true);
    try {
      const r = await api.post('/processos/triagem-aplicar', { itens }, { timeout: 60000 });
      toast.success(`${r.data.vinculados} processo(s) vinculado(s), ${r.data.clientes_criados} cliente(s) criado(s), ${r.data.telefones_atualizados} telefone(s) atualizado(s)`, { duration: 8000 });
      setModalTriagem(false); load();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao aplicar'); }
    finally { setAplicandoTriagem(false); }
  }

  // O quadro ocupa exatamente o espaço da sua posição até a base da tela — sem sobra
  useEffect(() => {
    const medir = () => {
      if (!quadroRef.current) return;
      const topo = quadroRef.current.getBoundingClientRect().top;
      setAlturaQuadro(`${Math.max(320, window.innerHeight - topo - 14)}px`);
    };
    medir();
    const t = setTimeout(medir, 300); // remede após fontes/layout assentarem
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, [etapas.length]);

  const load = () => {
    api.get('/processos/etapas').then(r => setEtapas(r.data)).catch(() => {});
    api.get('/processos/quadro').then(r => setProcessos(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get('/clients').then(r => setClientes(r.data || [])).catch(() => {});
    api.get('/processos/etiquetas-quadro').then(r => setCatalogoEtiquetas(r.data || [])).catch(() => {});
  }, []);

  async function criarCartao() {
    if (!novoCard.titulo.trim()) return toast.error('Informe o nome ou o número do processo');
    try {
      await api.post('/processos/quadro-card', { ...novoCard, etapa_id: modalNovo });
      toast.success('Cartão criado!');
      setModalNovo(null); setNovoCard({ titulo: '', client_id: '' });
      load();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao criar'); }
  }

  function abrirEtiquetas(p, e) {
    e.stopPropagation();
    let atuais = [];
    try { atuais = JSON.parse(p.trello_labels || '[]'); } catch {}
    setEtiquetasSel(atuais);
    setModalEtiquetas(p);
  }

  async function salvarEtiquetas() {
    try {
      await api.put(`/processos/${modalEtiquetas.id}/etiquetas`, { labels: etiquetasSel });
      setProcessos(prev => prev.map(x => x.id === modalEtiquetas.id ? { ...x, trello_labels: JSON.stringify(etiquetasSel) } : x));
      // Atualiza catálogo com etiquetas novas
      api.get('/processos/etiquetas-quadro').then(r => setCatalogoEtiquetas(r.data || [])).catch(() => {});
      setModalEtiquetas(null);
      if (cardAberto?.id === modalEtiquetas.id) setCardAberto(c => ({ ...c }));
      toast.success('Etiquetas salvas');
    } catch { toast.error('Erro ao salvar'); }
  }

  const temEtiqueta = (lb) => etiquetasSel.some(x => x.name === lb.name && x.color === lb.color);
  const toggleEtiqueta = (lb) => {
    setEtiquetasSel(prev => temEtiqueta(lb) ? prev.filter(x => !(x.name === lb.name && x.color === lb.color)) : [...prev, lb]);
  };

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

  const filtrados = busca.trim()
    ? processos.filter(p => {
        const t = busca.toLowerCase();
        return (p.numero_cnj || '').toLowerCase().includes(t)
            || (p.cliente_nome || '').toLowerCase().includes(t)
            || (p.trello_labels || '').toLowerCase().includes(t);
      })
    : processos;
  const semEtapa = filtrados.filter(p => !p.etapa_id || !etapas.some(e => e.id === p.etapa_id));

  const Card = ({ p, colIdx }) => (
    <div onClick={() => setCardAberto({ id: p.id, etapaNome: etapas.find(e => e.id === p.etapa_id)?.nome })} style={{
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
      <div style={{ display: 'flex', gap: 4, marginTop: 7, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        <button onClick={(e) => abrirEtiquetas(p, e)} title="Editar etiquetas"
          style={{ background: '#fdf6e3', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex' }}>
          <Tag size={12} color="#854f0b" />
        </button>
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
        <div style={{ position: 'relative', marginRight: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9a9a97' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, nº, etiqueta..."
            style={{ width: 210, padding: '8px 10px 8px 30px', fontSize: 13, border: '1px solid #d0cfc7', borderRadius: 9 }} />
          {busca && <X size={13} onClick={() => setBusca('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#9a9a97', cursor: 'pointer' }} />}
        </div>
        <input type="file" accept=".json,application/json" ref={fileRef} onChange={importarTrello} style={{ display: 'none' }} />
        <Btn variant="outline" onClick={() => fileRef.current?.click()} disabled={importando} style={{ marginRight: 8 }}>
          <UploadCloud size={14} /> {importando ? 'Importando...' : 'Importar do Trello'}
        </Btn>
        <Btn variant="outline" onClick={abrirTriagem} style={{ marginRight: 8 }}><Users size={14} /> Vincular clientes</Btn>
        <Btn variant="outline" onClick={() => setGerenciar(true)}><Settings2 size={14} /> Etapas</Btn>
      </Topbar>

      {etapas.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#6b6b68' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f2035', marginBottom: 6 }}>Seu quadro está vazio</p>
          <p style={{ fontSize: 13 }}>Importe seu quadro do Trello (botão acima) — as colunas e cartões chegam prontos.<br/>
          Ou crie as etapas manualmente em "Etapas".</p>
        </div>
      )}

      <div ref={quadroRef} className="quadro-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6,
        WebkitOverflowScrolling: 'touch', maxWidth: '100%',
        height: alturaQuadro, alignItems: 'flex-start' }}>
        {semEtapa.length > 0 && etapas.length > 0 && (
          <div style={{ minWidth: 250, maxWidth: 270, background: '#f3f1e8', borderRadius: 12, padding: '10px 8px',
            flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: '#854f0b', padding: '0 6px', marginBottom: 8, flexShrink: 0 }}>
              📥 Sem etapa ({semEtapa.length})
            </div>
            <div className="coluna-scroll" style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
              {semEtapa.map(p => <Card key={p.id} p={p} colIdx={-1} />)}
            </div>
          </div>
        )}
        {etapas.map((et, i) => {
          const itens = filtrados.filter(p => p.etapa_id === et.id);
          return (
            <div key={et.id} style={{ minWidth: 250, maxWidth: 270, background: '#f0efe8', borderRadius: 12, padding: '10px 8px',
              flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', marginBottom: 8, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: '#0d2340' }}>{et.nome}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ background: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: '#6b6b68' }}>{itens.length}</span>
                  <button onClick={() => { setModalNovo(et.id); setNovoCard({ titulo: '', client_id: '' }); }}
                    title="Novo cartão nesta etapa"
                    style={{ background: '#fff', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', display: 'flex' }}>
                    <Plus size={13} color="#0d2340" />
                  </button>
                </span>
              </div>
              <div className="coluna-scroll" style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>
                {itens.map(p => <Card key={p.id} p={p} colIdx={i} />)}
                {itens.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: 11.5, color: '#9a9a97' }}>vazio</div>}
              </div>
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
      {cardAberto && (
        <CardModal
          processoId={cardAberto.id}
          etapaNome={cardAberto.etapaNome}
          corLabel={corLabel}
          corTextoLabel={corTextoLabel}
          onClose={() => { setCardAberto(null); load(); }}
          onChange={load}
          onAbrirEtiquetas={(proc) => {
            let atuais = [];
            try { atuais = JSON.parse(proc.trello_labels || '[]'); } catch {}
            setEtiquetasSel(atuais);
            setModalEtiquetas(proc);
          }}
        />
      )}

      {/* ─── Painel: vincular processos aos clientes ─── */}
      {modalTriagem && (
        <div onClick={() => setModalTriagem(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,53,0.6)',
          zIndex: 250, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fbfbf9', borderRadius: 16, width: '100%',
            maxWidth: 940, boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '94vh' }}>

            <div style={{ background: '#0f2035', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fff' }}>Vincular processos aos clientes</div>
                {triagem && (
                  <div style={{ fontSize: 12, color: '#d8d5c8', marginTop: 2 }}>
                    {triagem.processos.length} processo(s) sem cliente · {triagem.contatos_whatsapp} contatos do WhatsApp consultados
                  </div>
                )}
              </div>
              <button onClick={() => setModalTriagem(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}>
                <X size={19} />
              </button>
            </div>

            <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
              {!triagem && <p style={{ color: '#6b6b68', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>
                Cruzando processos com clientes cadastrados e contatos do WhatsApp...</p>}

              {triagem && (
                <>
                  <div style={{ background: '#fdf6e3', borderRadius: 9, padding: '9px 14px', marginBottom: 14,
                    fontSize: 12, color: '#854f0b', lineHeight: 1.5 }}>
                    Sugestões de <b>alta confiança</b> já vêm marcadas. As de <b>confiança baixa</b> (nome único, ex.: só "Sabrina")
                    ficam desmarcadas de propósito — confira antes de aceitar. Escolha o destino do processo e, se quiser,
                    clique num <b>telefone do WhatsApp</b> para completar o cadastro.
                  </div>

                  {triagem.processos.map(s => {
                    const sel = selecao[s.processo_id];
                    const Opcao = ({ ativo, onSelect, children, cor = '#0f2035' }) => (
                      <div onClick={onSelect} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                        borderRadius: 9, cursor: 'pointer', background: ativo ? '#fff' : 'transparent',
                        border: `1.5px solid ${ativo ? cor : 'transparent'}`, marginBottom: 4 }}>
                        <span style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${ativo ? cor : '#c9c6b8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {ativo && <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor }} />}
                        </span>
                        <span style={{ fontSize: 13, color: '#374151', flex: 1, lineHeight: 1.4 }}>{children}</span>
                      </div>
                    );
                    const Score = ({ v }) => (
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 9px', marginLeft: 6,
                        background: v >= 75 ? '#eaf3de' : '#fdf0d5', color: v >= 75 ? '#3b6d11' : '#854f0b' }}>
                        {v >= 75 ? 'alta' : 'baixa'} · {v}%
                      </span>
                    );

                    return (
                      <div key={s.processo_id} style={{ background: sel ? '#f4f8f0' : '#fff', borderRadius: 12,
                        padding: '12px 16px', marginBottom: 10, border: `1px solid ${sel ? '#c5ddb0' : '#eceade'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2035' }}>
                              {s.nome_extraido || <i style={{ color: '#9a9a97', fontWeight: 400 }}>nome não identificado</i>}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#6b6b68', marginTop: 1 }}>
                              {s.numero_cnj} {s.tribunal ? `· ${s.tribunal}` : ''}
                            </div>
                          </div>
                        </div>

                        {s.cliente_sugerido && (
                          <Opcao ativo={!!sel?.client_id} cor="#185fa5"
                            onSelect={() => setSelecao(p => ({ ...p, [s.processo_id]: { client_id: s.cliente_sugerido.id, telefone: sel?.telefone || null } }))}>
                            Vincular ao cliente <b>{s.cliente_sugerido.nome}</b>
                            <Score v={s.cliente_sugerido.score} />
                            {s.cliente_sugerido.telefone
                              ? <span style={{ color: '#9a9a97', marginLeft: 6 }}>· já tem telefone</span>
                              : <span style={{ color: '#b45309', marginLeft: 6 }}>· sem telefone cadastrado</span>}
                          </Opcao>
                        )}

                        {s.nome_extraido && (
                          <Opcao ativo={!!sel?.criar_nome}
                            onSelect={() => setSelecao(p => ({ ...p, [s.processo_id]: { criar_nome: s.nome_extraido, telefone: sel?.telefone || null } }))}>
                            Criar cliente novo <b>{s.nome_extraido}</b>
                          </Opcao>
                        )}

                        {/* Telefones candidatos do WhatsApp — aplicáveis às duas opções acima */}
                        {(s.whatsapp_sugestoes || []).length > 0 && sel && (
                          <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px dashed #e5e3d8' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b6b68', marginBottom: 5, letterSpacing: '0.04em' }}>
                              📱 TELEFONE DO WHATSAPP (opcional — só preenche se estiver vazio)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {s.whatsapp_sugestoes.map((w, i) => {
                                const ativo = sel?.telefone === w.numero;
                                return (
                                  <span key={i} onClick={() => setSelecao(p => ({ ...p, [s.processo_id]: { ...sel, telefone: ativo ? null : w.numero } }))}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                      background: ativo ? '#eaf3de' : '#fff', border: `1.5px solid ${ativo ? '#3b6d11' : '#e5e3d8'}`,
                                      borderRadius: 20, padding: '4px 12px', fontSize: 12 }}>
                                    {ativo ? '✓ ' : ''}<b style={{ color: '#0f2035' }}>{w.nome}</b>
                                    <span style={{ color: '#3b6d11' }}>{w.numero}</span>
                                    <span style={{ fontSize: 10, color: w.score >= 75 ? '#3b6d11' : '#b45309' }}>{w.score}%</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <Opcao ativo={!sel} cor="#9a9a97"
                          onSelect={() => setSelecao(p => ({ ...p, [s.processo_id]: null }))}>
                          <span style={{ color: '#9a9a97' }}>Deixar na triagem por enquanto</span>
                        </Opcao>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div style={{ padding: '12px 22px', borderTop: '1px solid #eceade', background: '#fff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#6b6b68' }}>
                <b style={{ color: '#0f2035' }}>{Object.values(selecao).filter(Boolean).length}</b> processo(s) marcado(s)
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalTriagem(false)}
                  style={{ padding: '9px 18px', background: '#fff', color: '#0f2035', border: '1.5px solid #d0cfc7',
                    borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={aplicarTriagem} disabled={aplicandoTriagem || !triagem}
                  style={{ padding: '9px 20px', background: '#0f2035', color: '#fff', border: 'none',
                    borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {aplicandoTriagem ? 'Aplicando...' : 'Aplicar vinculações'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: novo cartão ─── */}
      <Modal open={!!modalNovo} onClose={() => setModalNovo(null)} title="Novo cartão"
        footer={<><Btn variant="outline" onClick={() => setModalNovo(null)}>Cancelar</Btn><Btn onClick={criarCartao}>Criar</Btn></>}>
        <FormGrid cols={1}>
          <FormField label="Nome do caso OU número do processo *">
            <input value={novoCard.titulo} onChange={e => setNovoCard(f => ({ ...f, titulo: e.target.value }))}
              placeholder='Ex: "Camila - revisional" ou "0801234-56.2026.8.19.0001"' autoFocus
              onKeyDown={e => e.key === 'Enter' && criarCartao()} />
          </FormField>
          <FormField label="Cliente (opcional — sem cliente vai para a TRIAGEM)">
            <SearchableSelect value={novoCard.client_id}
              onChange={val => setNovoCard(f => ({ ...f, client_id: val }))}
              options={clientes.map(cl => ({ value: cl.id, label: cl.nome }))}
              placeholder="Buscar cliente..." />
          </FormField>
          <p style={{ fontSize: 11.5, color: '#6b6b68', margin: 0 }}>
            Com número CNJ, o processo entra no monitoramento automático. Sem número, fica como pré-distribuição (igual ao seu Trello).
          </p>
        </FormGrid>
      </Modal>

      {/* ─── Modal: etiquetas ─── */}
      <Modal open={!!modalEtiquetas} onClose={() => setModalEtiquetas(null)}
        title={`Etiquetas — ${modalEtiquetas?.numero_cnj || ''}`}
        footer={<><Btn variant="outline" onClick={() => setModalEtiquetas(null)}>Cancelar</Btn><Btn onClick={salvarEtiquetas}>Salvar</Btn></>}>
        <p style={{ fontSize: 12, color: '#6b6b68', margin: '0 0 10px' }}>Clique para marcar/desmarcar:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {catalogoEtiquetas.map((lb, i) => (
            <span key={i} onClick={() => toggleEtiqueta(lb)}
              style={{ background: corLabel(lb.color), color: corTextoLabel(lb.color),
                borderRadius: 6, padding: '4px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                outline: temEtiqueta(lb) ? '2.5px solid #0f2035' : 'none', outlineOffset: 1,
                opacity: temEtiqueta(lb) ? 1 : 0.65 }}>
              {temEtiqueta(lb) ? '✓ ' : ''}{lb.name || '(sem nome)'}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#0d2340', margin: '0 0 6px' }}>Criar etiqueta nova:</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={novaEtiqueta.name} onChange={e => setNovaEtiqueta(f => ({ ...f, name: e.target.value }))}
            placeholder="Nome da etiqueta" style={{ flex: 1 }} />
          <select value={novaEtiqueta.color} onChange={e => setNovaEtiqueta(f => ({ ...f, color: e.target.value }))}
            style={{ width: 130, background: corLabel(novaEtiqueta.color), color: corTextoLabel(novaEtiqueta.color), fontWeight: 700 }}>
            {Object.keys(CORES_TRELLO).map(cor => <option key={cor} value={cor}>{cor.replace('_', ' ')}</option>)}
          </select>
          <Btn onClick={() => {
            if (!novaEtiqueta.name.trim()) return toast.error('Dê um nome');
            const nova = { name: novaEtiqueta.name.trim(), color: novaEtiqueta.color };
            setCatalogoEtiquetas(prev => [...prev, nova]);
            setEtiquetasSel(prev => [...prev, nova]);
            setNovaEtiqueta({ name: '', color: 'blue' });
          }}><Plus size={13} /></Btn>
        </div>
      </Modal>

      <style>{`
        .quadro-scroll::-webkit-scrollbar { height: 12px; }
        .quadro-scroll::-webkit-scrollbar-track { background: #e8e6dc; border-radius: 8px; }
        .quadro-scroll::-webkit-scrollbar-thumb { background: #0f2035; border-radius: 8px; }
        .quadro-scroll::-webkit-scrollbar-thumb:hover { background: #1a3a5c; }
        .quadro-scroll { scrollbar-width: auto; scrollbar-color: #0f2035 #e8e6dc; }
        .coluna-scroll::-webkit-scrollbar { width: 6px; }
        .coluna-scroll::-webkit-scrollbar-track { background: transparent; }
        .coluna-scroll::-webkit-scrollbar-thumb { background: #c9c6b8; border-radius: 6px; }
      `}</style>
    </div>
  );
}




