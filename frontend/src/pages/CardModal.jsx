// Painel do cartão — equivalente ao detalhe do cartão no Trello.
// Título, etiquetas, descrição, checklist, prazos, comentários e movimentações reais do tribunal.
import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { X, Tag, AlignLeft, CheckSquare, MessageSquare, CalendarClock, Trash2, Plus, ExternalLink, Gavel } from 'lucide-react';

function fmtData(d) { try { return new Date((d||'').slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } }
function fmtDataHora(d) { try { return new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return d; } }

export default function CardModal({ processoId, etapaNome, corLabel, corTextoLabel, onClose, onChange, onAbrirEtiquetas }) {
  const nav = useNavigate();
  const [card, setCard] = useState(null);
  const [desc, setDesc] = useState('');
  const [editandoDesc, setEditandoDesc] = useState(false);
  const [novoComentario, setNovoComentario] = useState('');
  const [novoItem, setNovoItem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const load = () => {
    api.get(`/processos/${processoId}/card`).then(r => {
      setCard(r.data);
      setDesc(r.data.observacoes || '');
    }).catch(() => toast.error('Erro ao carregar cartão'));
  };
  useEffect(() => { if (processoId) load(); }, [processoId]);

  async function salvarDesc() {
    setSalvando(true);
    try {
      await api.put(`/processos/${processoId}/card`, { observacoes: desc });
      setEditandoDesc(false);
      toast.success('Descrição salva');
      onChange?.();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function comentar() {
    if (!novoComentario.trim()) return;
    try {
      await api.post(`/processos/${processoId}/comentarios`, { texto: novoComentario });
      setNovoComentario('');
      load();
    } catch { toast.error('Erro ao comentar'); }
  }
  async function excluirComentario(id) {
    try { await api.delete(`/processos/${processoId}/comentarios/${id}`); load(); } catch {}
  }

  async function addItem() {
    if (!novoItem.trim()) return;
    try { await api.post(`/processos/${processoId}/checklist`, { texto: novoItem }); setNovoItem(''); load(); }
    catch { toast.error('Erro'); }
  }
  async function toggleItem(item) {
    setCard(c => ({ ...c, checklist: c.checklist.map(i => i.id === item.id ? { ...i, concluido: item.concluido ? 0 : 1 } : i) }));
    try { await api.put(`/processos/${processoId}/checklist/${item.id}`, { concluido: !item.concluido }); } catch { load(); }
  }
  async function excluirItem(id) {
    try { await api.delete(`/processos/${processoId}/checklist/${id}`); load(); } catch {}
  }

  if (!processoId) return null;

  let labels = [];
  try { labels = JSON.parse(card?.trello_labels || '[]'); } catch {}
  const feitos = (card?.checklist || []).filter(i => i.concluido).length;
  const totalCheck = (card?.checklist || []).length;

  const Secao = ({ icone, titulo, children }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        {icone}<span style={{ fontWeight: 800, fontSize: 13.5, color: '#0f2035' }}>{titulo}</span>
      </div>
      <div style={{ paddingLeft: 24 }}>{children}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,53,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fbfbf9', borderRadius: 16, width: '100%',
        maxWidth: 720, boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Cabeçalho */}
        <div style={{ background: '#0f2035', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: '#c5a859', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3 }}>
              {etapaNome || 'SEM ETAPA'}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.25 }}>
              {card?.numero_cnj || 'Carregando...'}
            </div>
            {card?.cliente_nome && (
              <div style={{ fontSize: 12.5, color: '#d8d5c8', marginTop: 3 }}>
                {card.cliente_nome} · {card.tribunal}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', height: 24 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', maxHeight: '72vh', overflowY: 'auto' }}>
          {!card && <p style={{ color: '#9a9a97' }}>Carregando...</p>}
          {card && (<>

            {/* Etiquetas */}
            <Secao icone={<Tag size={15} color="#854f0b" />} titulo="Etiquetas">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                {labels.map((lb, i) => (
                  <span key={i} style={{ background: corLabel(lb.color), color: corTextoLabel(lb.color),
                    borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{lb.name || '\u00A0\u00A0'}</span>
                ))}
                <button onClick={() => onAbrirEtiquetas(card)}
                  style={{ background: '#e8e6dc', border: 'none', borderRadius: 5, padding: '3px 9px',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#0f2035' }}>
                  {labels.length ? 'editar' : '+ adicionar'}
                </button>
              </div>
            </Secao>

            {/* Descrição */}
            <Secao icone={<AlignLeft size={15} color="#854f0b" />} titulo="Descrição">
              {editandoDesc ? (
                <>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={6} autoFocus
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid #d0cfc7', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5 }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={salvarDesc} disabled={salvando}
                      style={{ background: '#0f2035', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button onClick={() => { setDesc(card.observacoes || ''); setEditandoDesc(false); }}
                      style={{ background: 'none', border: 'none', color: '#6b6b68', fontSize: 12.5, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <div onClick={() => setEditandoDesc(true)}
                  style={{ background: desc ? '#fff' : '#f0efe8', borderRadius: 8, padding: '10px 12px',
                    fontSize: 13, color: desc ? '#374151' : '#9a9a97', cursor: 'text', whiteSpace: 'pre-wrap',
                    minHeight: 40, lineHeight: 1.5 }}>
                  {desc || 'Adicione uma descrição mais detalhada...'}
                </div>
              )}
            </Secao>

            {/* Checklist */}
            <Secao icone={<CheckSquare size={15} color="#854f0b" />}
              titulo={`Checklist${totalCheck ? ` (${feitos}/${totalCheck})` : ''}`}>
              {totalCheck > 0 && (
                <div style={{ background: '#e5e7eb', borderRadius: 8, height: 6, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ background: feitos === totalCheck ? '#3b6d11' : '#c5a859', height: '100%',
                    width: `${(feitos / totalCheck) * 100}%`, transition: 'width .3s' }} />
                </div>
              )}
              {card.checklist.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <input type="checkbox" checked={!!item.concluido} onChange={() => toggleItem(item)}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#3b6d11' }} />
                  <span style={{ flex: 1, fontSize: 13, color: item.concluido ? '#9a9a97' : '#374151',
                    textDecoration: item.concluido ? 'line-through' : 'none' }}>{item.texto}</span>
                  <button onClick={() => excluirItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                    <Trash2 size={12} color="#c9c6b8" />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input value={novoItem} onChange={e => setNovoItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Adicionar item..."
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #d0cfc7', fontSize: 12.5 }} />
                <button onClick={addItem} style={{ background: '#e8e6dc', border: 'none', borderRadius: 7,
                  padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Plus size={14} color="#0f2035" />
                </button>
              </div>
            </Secao>

            {/* Prazos */}
            <Secao icone={<CalendarClock size={15} color="#854f0b" />} titulo="Prazos e datas">
              {card.prazos.length === 0 && <p style={{ fontSize: 12.5, color: '#9a9a97' }}>Nenhum prazo. Crie na Agenda de Prazos.</p>}
              {card.prazos.map(pz => {
                const vencido = !pz.concluido && pz.data_limite < new Date().toISOString().slice(0, 10);
                return (
                  <div key={pz.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                    padding: '5px 0', fontSize: 12.5, color: pz.concluido ? '#9a9a97' : '#374151' }}>
                    <span style={{ textDecoration: pz.concluido ? 'line-through' : 'none' }}>{pz.titulo}</span>
                    <b style={{ color: vencido ? '#a32d2d' : (pz.concluido ? '#9a9a97' : '#854f0b'), whiteSpace: 'nowrap' }}>
                      {fmtData(pz.data_limite)}{vencido ? ' ⚠️' : ''}
                    </b>
                  </div>
                );
              })}
            </Secao>

            {/* Movimentações do tribunal */}
            {card.andamentos?.length > 0 && (
              <Secao icone={<Gavel size={15} color="#854f0b" />} titulo="Movimentações do tribunal">
                <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', maxHeight: 170, overflowY: 'auto' }}>
                  {card.andamentos.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12, padding: '3px 0', color: '#374151' }}>
                      <span style={{ color: '#9a9a97', flexShrink: 0, fontWeight: 600 }}>{fmtData(a.data)}</span>
                      <span>{a.descricao}</span>
                    </div>
                  ))}
                </div>
              </Secao>
            )}

            {/* Comentários */}
            <Secao icone={<MessageSquare size={15} color="#854f0b" />} titulo="Comentários e atividade">
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input value={novoComentario} onChange={e => setNovoComentario(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && comentar()} placeholder="Escrever um comentário..."
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #d0cfc7', fontSize: 13 }} />
                <button onClick={comentar} style={{ background: '#0f2035', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '0 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Enviar</button>
              </div>
              {card.comentarios.length === 0 && <p style={{ fontSize: 12.5, color: '#9a9a97' }}>Nenhum comentário ainda.</p>}
              {card.comentarios.map(cm => (
                <div key={cm.id} style={{ background: '#fff', borderRadius: 8, padding: '9px 12px', marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9a9a97', marginBottom: 3 }}>
                    <b style={{ color: '#0f2035' }}>{cm.autor || 'Sistema'}</b>
                    <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      {fmtDataHora(cm.created_at)}
                      <Trash2 size={11} style={{ cursor: 'pointer' }} onClick={() => excluirComentario(cm.id)} />
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{cm.texto}</div>
                </div>
              ))}
            </Secao>

            <button onClick={() => nav(`/processos/${card.id}`)}
              style={{ width: '100%', padding: '10px', background: '#e8e6dc', color: '#0f2035', border: 'none',
                borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <ExternalLink size={14} /> Abrir página completa do processo
            </button>
          </>)}
        </div>
      </div>
    </div>
  );
}
