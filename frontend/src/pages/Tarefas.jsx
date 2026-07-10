// Kanban de Tarefas — A Fazer / Em Andamento / Concluído
import { useState, useEffect } from 'react';
import { Topbar, Btn, Modal, FormGrid, FormField } from '../components/UI.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Plus, ChevronLeft, ChevronRight, Trash2, CalendarClock, User, Flag } from 'lucide-react';

const COLUNAS = [
  { id: 'a_fazer',      titulo: '📋 A Fazer',       cor: '#185fa5' },
  { id: 'em_andamento', titulo: '⚙️ Em Andamento',  cor: '#854f0b' },
  { id: 'concluida',    titulo: '✅ Concluído',      cor: '#3b6d11' },
];
const PRIORIDADES = { alta: { label: 'Alta', cor: '#a32d2d' }, normal: { label: 'Normal', cor: '#185fa5' }, baixa: { label: 'Baixa', cor: '#9a9a97' } };

function fmtData(d) { try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch { return d; } }
function atrasada(t) { return t.data_limite && t.status !== 'concluida' && t.data_limite < new Date().toISOString().slice(0, 10); }

export default function Tarefas() {
  const [tarefas, setTarefas] = useState([]);
  const [users, setUsers] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [filtroResp, setFiltroResp] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', responsavel_id: '', client_id: '', prioridade: 'normal', data_limite: '' });

  const load = () => {
    const q = filtroResp ? `?responsavel_id=${filtroResp}` : '';
    api.get(`/tarefas${q}`).then(r => setTarefas(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, [filtroResp]);
  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data || [])).catch(() => {});
    api.get('/clients').then(r => setClientes(r.data || [])).catch(() => {});
  }, []);

  async function criar() {
    if (!form.titulo.trim()) return toast.error('Dê um título à tarefa');
    try {
      await api.post('/tarefas', form);
      toast.success('Tarefa criada!');
      setModal(false);
      setForm({ titulo: '', descricao: '', responsavel_id: '', client_id: '', prioridade: 'normal', data_limite: '' });
      load();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao criar'); }
  }

  async function mover(t, direcao) {
    const idx = COLUNAS.findIndex(c => c.id === t.status);
    const novo = COLUNAS[idx + direcao]?.id;
    if (!novo) return;
    // Otimista
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: novo } : x));
    try { await api.put(`/tarefas/${t.id}`, { status: novo }); }
    catch { toast.error('Erro ao mover'); load(); }
  }

  async function excluir(t) {
    if (!window.confirm(`Excluir a tarefa "${t.titulo}"?`)) return;
    try { await api.delete(`/tarefas/${t.id}`); setTarefas(prev => prev.filter(x => x.id !== t.id)); toast.success('Excluída'); }
    catch { toast.error('Erro ao excluir'); }
  }

  return (
    <div>
      <Topbar title="Tarefas">
        <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)}
          style={{ width: 'auto', minWidth: 170, marginRight: 8 }}>
          <option value="">Todas as responsáveis</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <Btn onClick={() => setModal(true)}><Plus size={14} /> Nova Tarefa</Btn>
      </Topbar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {COLUNAS.map((col, colIdx) => {
          const itens = tarefas.filter(t => t.status === col.id);
          return (
            <div key={col.id} style={{ background: '#f0efe8', borderRadius: 12, padding: '12px 10px', minHeight: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#0d2340' }}>{col.titulo}</span>
                <span style={{ background: '#fff', borderRadius: 20, padding: '1px 9px', fontSize: 12, fontWeight: 700, color: col.cor }}>{itens.length}</span>
              </div>

              {itens.map(t => (
                <div key={t.id} style={{
                  background: '#fff', borderRadius: 10, padding: '11px 12px', marginBottom: 8,
                  borderLeft: `3px solid ${PRIORIDADES[t.prioridade]?.cor || '#185fa5'}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a18', marginBottom: 4 }}>{t.titulo}</div>
                  {t.descricao && <div style={{ fontSize: 12, color: '#6b6b68', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{t.descricao}</div>}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#6b6b68', marginBottom: 8 }}>
                    {t.responsavel_nome && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={11} /> {t.responsavel_nome.split(' ')[0]}</span>}
                    {t.cliente_nome && <span>👤 {t.cliente_nome.split(' ').slice(0, 2).join(' ')}</span>}
                    {t.data_limite && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3,
                        color: atrasada(t) ? '#a32d2d' : '#6b6b68', fontWeight: atrasada(t) ? 700 : 400 }}>
                        <CalendarClock size={11} /> {fmtData(t.data_limite)}{atrasada(t) ? ' ⚠️' : ''}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => mover(t, -1)} disabled={colIdx === 0}
                        style={{ background: colIdx === 0 ? '#f5f5f0' : '#e8f0fe', border: 'none', borderRadius: 6,
                          padding: '4px 8px', cursor: colIdx === 0 ? 'default' : 'pointer', display: 'flex' }}>
                        <ChevronLeft size={13} color={colIdx === 0 ? '#ccc' : '#185fa5'} />
                      </button>
                      <button onClick={() => mover(t, 1)} disabled={colIdx === COLUNAS.length - 1}
                        style={{ background: colIdx === COLUNAS.length - 1 ? '#f5f5f0' : '#eaf3de', border: 'none', borderRadius: 6,
                          padding: '4px 8px', cursor: colIdx === COLUNAS.length - 1 ? 'default' : 'pointer', display: 'flex' }}>
                        <ChevronRight size={13} color={colIdx === COLUNAS.length - 1 ? '#ccc' : '#3b6d11'} />
                      </button>
                    </div>
                    <button onClick={() => excluir(t)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                      <Trash2 size={13} color="#9a9a97" />
                    </button>
                  </div>
                </div>
              ))}
              {itens.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: 12, color: '#9a9a97' }}>Sem tarefas aqui</div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nova Tarefa"
        footer={<><Btn variant="outline" onClick={() => setModal(false)}>Cancelar</Btn><Btn onClick={criar}>Criar tarefa</Btn></>}>
        <FormGrid cols={2}>
          <FormField label="Título *" col={2}>
            <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Protocolar petição inicial do caso TIM" />
          </FormField>
          <FormField label="Descrição" col={2}>
            <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Detalhes, links, observações..." />
          </FormField>
          <FormField label="Responsável">
            <select value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
              <option value="">Eu mesma</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </FormField>
          <FormField label="Prioridade">
            <select value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}>
              <option value="alta">🔴 Alta</option>
              <option value="normal">🔵 Normal</option>
              <option value="baixa">⚪ Baixa</option>
            </select>
          </FormField>
          <FormField label="Cliente (opcional)">
            <SearchableSelect
              value={form.client_id}
              onChange={val => setForm(f => ({ ...f, client_id: val }))}
              options={clientes.map(c => ({ value: c.id, label: c.nome }))}
              placeholder="Vincular a um cliente"
            />
          </FormField>
          <FormField label="Prazo (opcional)">
            <input type="date" value={form.data_limite} onChange={e => setForm(f => ({ ...f, data_limite: e.target.value }))} />
          </FormField>
        </FormGrid>
      </Modal>
    </div>
  );
}
