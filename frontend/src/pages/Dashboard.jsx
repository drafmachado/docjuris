import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, Topbar, Btn, Table, Tr, Td, Badge, EmptyState } from '../components/UI.jsx';
import GenerateModal from '../components/GenerateModal.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Users, FileText, FileStack, Send, Clock, TrendingUp } from 'lucide-react';
import { format, parseISO, subMonths, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const statusColor = s => s === 'enviado' ? 'green' : s === 'erro' ? 'red' : 'blue';
const statusLabel = s => ({ enviado: 'Enviado', gerado: 'Gerado', erro: 'Erro' }[s] || s);

const CHART_COLORS = ['#1a3a5c', '#185fa5', '#2d7dd2', '#5fa8e8', '#97c459', '#f0a830'];

export default function Dashboard() {
  const [docs, setDocs] = useState([]);
  const [links, setLinks] = useState([]);
  const [stats, setStats] = useState({ clients: 0, docs: 0, templates: 0, sent: 0, pending: 0 });
  const [byType, setByType] = useState([]);
  const [byMonth, setByMonth] = useState([]);
  const [byUser, setByUser] = useState([]);
  const [conversion, setConversion] = useState({ total: 0, completed: 0, rate: 0 });
  const [showGenerate, setShowGenerate] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [docsRes, clientsRes, templatesRes, linksRes] = await Promise.all([
        api.get('/documents'),
        api.get('/clients'),
        api.get('/templates'),
        api.get('/upload-links').catch(() => ({ data: [] })),
      ]);

      const allDocs = docsRes.data;
      const allLinks = linksRes.data;

      setDocs(allDocs.slice(0, 8));
      setLinks(allLinks);

      // Links pendentes (não completados)
      const pendingLinks = allLinks.filter(l => !l.completed_at);

      setStats({
        clients: clientsRes.data.length,
        docs: allDocs.length,
        templates: templatesRes.data.length,
        sent: allDocs.filter(d => d.email_sent).length,
        pending: pendingLinks.length,
      });

      // ── Documentos por tipo/template ──
      const typeMap = {};
      allDocs.forEach(d => {
        const name = d.template_name || 'Sem template';
        typeMap[name] = (typeMap[name] || 0) + 1;
      });
      setByType(Object.entries(typeMap).map(([name, value]) => ({ name, value })));

      // ── Documentos por mês (últimos 6 meses) ──
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = startOfMonth(subMonths(new Date(), i));
        months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM', { locale: ptBR }), value: 0 });
      }
      allDocs.forEach(d => {
        try {
          const key = format(parseISO(d.created_at.replace(' ', 'T')), 'yyyy-MM');
          const m = months.find(x => x.key === key);
          if (m) m.value++;
        } catch {}
      });
      setByMonth(months);

      // ── Documentos por usuário ──
      const userMap = {};
      allDocs.forEach(d => {
        const name = d.generated_by_name || 'Desconhecido';
        userMap[name] = (userMap[name] || 0) + 1;
      });
      setByUser(Object.entries(userMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));

      // ── Taxa de conversão dos links ──
      const completed = allLinks.filter(l => l.completed_at).length;
      setConversion({
        total: allLinks.length,
        completed,
        rate: allLinks.length > 0 ? Math.round((completed / allLinks.length) * 100) : 0,
      });

    } catch {}
  };

  const [solicitacoes, setSolicitacoes] = useState([]);

  const loadSolicitacoes = async () => {
    try { const r = await api.get('/exclusao'); setSolicitacoes(r.data); } catch {}
  };

  useEffect(() => {
    load();
    loadSolicitacoes();
    const interval = setInterval(() => { load(); loadSolicitacoes(); }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAprovar = async (id) => {
    if (!window.confirm('Confirma a EXCLUSÃO permanente deste registro?')) return;
    try {
      await api.put(`/exclusao/${id}/aprovar`);
      toast.success('Exclusão aprovada e executada.');
      loadSolicitacoes();
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  };

  const handleRejeitar = async (id) => {
    await api.put(`/exclusao/${id}/rejeitar`);
    toast.success('Solicitação rejeitada.');
    loadSolicitacoes();
  };

  const fmt = dateStr => {
    try { return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR }); } catch { return dateStr; }
  };

  const statCards = [
    { label: 'Clientes', value: stats.clients, icon: <Users size={18} />, sub: 'cadastrados', color: '#1a3a5c', bg: 'rgba(26,58,92,0.08)' },
    { label: 'Documentos', value: stats.docs, icon: <FileText size={18} />, sub: 'gerados no total', color: '#185fa5', bg: 'rgba(24,95,165,0.1)' },
    { label: 'Templates', value: stats.templates, icon: <FileStack size={18} />, sub: 'disponíveis', color: '#8a6d1f', bg: 'rgba(197,168,89,0.16)' },
    { label: 'Enviados', value: stats.sent, icon: <Send size={18} />, sub: 'por email', color: '#3b6d11', bg: 'rgba(59,109,17,0.1)' },
    { label: 'Links pendentes', value: stats.pending, icon: <Clock size={18} />, sub: 'aguardando cliente', color: '#a32d2d', bg: 'rgba(163,45,45,0.1)' },
  ];

  return (
    <div>
      <style>{`
        .kpiCard { transition: transform .2s, box-shadow .2s; }
        .kpiCard:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.06); }
      `}</style>
      <Topbar title="Dashboard">
        <Btn onClick={() => setShowGenerate(true)}>+ Gerar Documento</Btn>
      </Topbar>

      {/* Cards de estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: '1.5rem' }}>
        {statCards.map((s, i) => (
          <div key={i} className="kpiCard" style={{ background: '#fbfbf9', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 16, padding: '1.2rem' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: '#0f2035', marginTop: 4, letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Gráficos linha 1: por mês + taxa de conversão */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            <TrendingUp size={15} /> Documentos gerados por mês
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={byMonth} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b6b68' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b6b68' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.1)' }} />
              <Line type="monotone" dataKey="value" stroke="#1a3a5c" strokeWidth={2} dot={{ r: 3, fill: '#1a3a5c' }} name="Documentos" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Taxa de conversão dos links</div>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: '#1a3a5c' }}>{conversion.rate}%</div>
            <div style={{ fontSize: 12, color: '#6b6b68', marginTop: 8 }}>
              {conversion.completed} de {conversion.total} links completados
            </div>
            <div style={{ marginTop: 16, height: 8, background: '#f0f0eb', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${conversion.rate}%`, height: '100%', background: '#97c459', transition: 'width 0.5s' }} />
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos linha 2: por tipo + por usuário */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Documentos por tipo</div>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byType} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b6b68' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b6b68' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.1)' }} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Documentos">
                  {byType.map((e, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="📊" title="Sem dados ainda" />}
        </Card>

        <Card style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Documentos por usuário</div>
          {byUser.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
              {byUser.map((u, i) => {
                const max = byUser[0].value || 1;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#1a1a18' }}>{u.name}</span>
                      <span style={{ color: '#6b6b68', fontWeight: 600 }}>{u.value}</span>
                    </div>
                    <div style={{ height: 8, background: '#f0f0eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(u.value / max) * 100}%`, height: '100%', background: CHART_COLORS[i % CHART_COLORS.length], transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon="👤" title="Sem dados ainda" />}
        </Card>
      </div>

      {/* Documentos recentes */}
      <Card>
        <CardHeader title="Documentos recentes" action={<Btn variant="outline" size="sm" onClick={() => navigate('/documents')}>Ver todos</Btn>} />
        <Table headers={['Cliente', 'Documento', 'Data', 'Status', '']}>
          {docs.map(d => (
            <Tr key={d.id} onClick={() => navigate(`/clients/${d.client_id}`)}>
              <Td>{d.client_name}</Td>
              <Td>{d.template_name}</Td>
              <Td muted>{fmt(d.created_at)}</Td>
              <Td><Badge color={statusColor(d.status)}>{statusLabel(d.status)}</Badge></Td>
              <Td>
                {d.pdf_filename && <a href={`/files/pdfs/${d.pdf_filename}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#185fa5', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>PDF</a>}
              </Td>
            </Tr>
          ))}
          {docs.length === 0 && <tr><td colSpan={5}><EmptyState icon="📄" title="Nenhum documento gerado ainda" subtitle="Clique em 'Gerar Documento' para começar" /></td></tr>}
        </Table>
      </Card>

      <GenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} onSuccess={() => { setShowGenerate(false); load(); }} />

      {/* Painel de solicitações de exclusão */}
      {solicitacoes.length > 0 && (
        <div style={{ marginTop:'1.5rem', background:'#fff8f1', border:'1.5px solid #fca5a5', borderRadius:12, padding:'1rem 1.2rem' }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'#dc2626', margin:'0 0 12px', display:'flex', alignItems:'center', gap:6 }}>
            ⚠️ Solicitações de Exclusão Pendentes ({solicitacoes.length})
          </h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {solicitacoes.map(s => (
              <div key={s.id} style={{ background:'#fff', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px',
                display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                <div>
                  <p style={{ margin:0, fontWeight:600, fontSize:13 }}>{s.tipo.toUpperCase()}: {s.referencia_nome}</p>
                  <p style={{ margin:0, fontSize:12, color:'#6b6b68' }}>
                    Solicitado por: {s.solicitante} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
                    {s.motivo && ` · "${s.motivo}"`}
                  </p>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => handleRejeitar(s.id)}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #d0cfc7',
                      background:'#fff', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                    Rejeitar
                  </button>
                  <button onClick={() => handleAprovar(s.id)}
                    style={{ padding:'6px 14px', borderRadius:8, border:'none',
                      background:'#dc2626', color:'#fff', fontSize:12, cursor:'pointer', fontWeight:700 }}>
                    Aprovar Exclusão
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
