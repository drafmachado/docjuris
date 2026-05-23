import { useState, useEffect } from 'react';
import { Card, Topbar, Btn, Modal, FormField, FormGrid, Badge, EmptyState } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { UserPlus, Pencil, UserX } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';

const blank = { name: '', email: '', password: '', role: 'colaborador', active: true };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // null | 'new' | user object
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const { user: me } = useAuth();

  const load = () => api.get('/users').then(r => setUsers(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const openNew = () => { setForm(blank); setModal('new'); };
  const openEdit = u => { setForm({ ...u, password: '' }); setModal(u); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modal === 'new') {
        await api.post('/users', form);
        toast.success('Usuário criado!');
      } else {
        await api.put(`/users/${modal.id}`, form);
        toast.success('Usuário atualizado!');
      }
      setModal(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async id => {
    if (!confirm('Desativar este usuário?')) return;
    try { await api.delete(`/users/${id}`); toast.success('Usuário desativado'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  return (
    <div>
      <Topbar title="Usuários">
        <Btn onClick={openNew}><UserPlus size={14} /> Novo usuário</Btn>
      </Topbar>

      <div style={{ display: 'grid', gap: 10 }}>
        {users.length === 0 && <Card style={{ padding: '3rem' }}><EmptyState icon="👥" title="Nenhum usuário cadastrado" /></Card>}
        {users.map(u => (
          <Card key={u.id} style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: u.role === 'admin' ? '#e8f0fe' : '#f1efe8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: u.role === 'admin' ? '#185fa5' : '#5f5e5a', flexShrink: 0 }}>
              {u.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</span>
                <Badge color={u.role === 'admin' ? 'blue' : 'gray'}>{u.role === 'admin' ? 'Administrador' : 'Colaborador'}</Badge>
                {!u.active && <Badge color="red">Inativo</Badge>}
                {u.id === me?.id && <Badge color="green">Você</Badge>}
              </div>
              <p style={{ fontSize: 12, color: '#6b6b68', marginTop: 2 }}>{u.email}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="outline" size="sm" onClick={() => openEdit(u)}><Pencil size={13} /> Editar</Btn>
              {u.id !== me?.id && u.active && (
                <Btn variant="danger" size="sm" onClick={() => handleDeactivate(u.id)}><UserX size={13} /></Btn>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Novo usuário' : 'Editar usuário'}
        footer={<><Btn variant="outline" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={handleSave} loading={saving}>{modal === 'new' ? 'Criar' : 'Salvar'}</Btn></>}
      >
        <FormGrid cols={2}>
          <FormField label="Nome completo" col={2}><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" /></FormField>
          <FormField label="Email (login)" col={2}><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@escritorio.com" /></FormField>
          <FormField label={modal === 'new' ? 'Senha' : 'Nova senha (deixe vazio para manter)'}><input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Mín. 6 caracteres" /></FormField>
          <FormField label="Perfil">
            <select value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="colaborador">Colaborador</option>
              <option value="admin">Administrador</option>
            </select>
          </FormField>
        </FormGrid>
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f5f5f0', borderRadius: 8, fontSize: 12, color: '#6b6b68' }}>
          <strong>Colaborador:</strong> pode gerar documentos e gerenciar clientes.<br />
          <strong>Administrador:</strong> acesso total, incluindo templates, usuários e configurações.
        </div>
      </Modal>
    </div>
  );
}
