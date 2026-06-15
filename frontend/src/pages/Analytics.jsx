import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';

const ETAPA_LABEL = { contato:'Contato', consulta:'Consulta', proposta:'Proposta', contratado:'Contratado', perdido:'Perdido' };
const ORIGEM_LABEL = { site:'Site', instagram:'Instagram', indicacao:'Indicação', whatsapp:'WhatsApp', linkedin:'LinkedIn', outro:'Outro' };
const STATUS_COLOR = { pendente:'#f59e0b', pago:'#22c55e', atrasado:'#ef4444', cancelado:'#6b7280' };
const PIE_COLORS = ['#0d2340','#c5a859','#22c55e','#ef4444','#6b7280','#3b82f6'];

const fmt = v => `R$ ${parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
const fmtMes = m => { if(!m) return ''; const [y,mo]=m.split('-'); const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${meses[parseInt(mo)-1]}/${y.slice(2)}`; };

function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e2d6', borderRadius:12, padding:'1rem 1.2rem', flex:1, minWidth:140 }}>
      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#6b6b68' }}>{label}</p>
      <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color: color||'#0d2340' }}>{value}</p>
      {sub && <p style={{ margin:'2px 0 0', fontSize:11, color:'#6b6b68' }}>{sub}</p>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e2d6', borderRadius:12, padding:'1.2rem', marginBottom:'1rem' }}>
      <h3 style={{ margin:'0 0 1rem', fontSize:14, fontWeight:700, color:'#0d2340' }}>{title}</h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign:'center', padding:'3rem', color:'#6b6b68' }}>Carregando métricas...</div>;
  if (!data) return <div style={{ textAlign:'center', padding:'3rem', color:'#ef4444' }}>Erro ao carregar dados</div>;

  const { leads, financeiro, clientes, processos, documentos } = data;

  const etapaData = leads.porEtapa.map(e => ({ name: ETAPA_LABEL[e.etapa]||e.etapa, total: e.total }));
  const origemData = leads.porOrigem.map(o => ({ name: ORIGEM_LABEL[o.origem]||o.origem, total: o.total }));
  const finData = financeiro.porStatus.map(s => ({ name: s.status.toUpperCase(), value: parseFloat(s.total||0), qtd: s.qtd }));
  const mesData = financeiro.porMes.map(m => ({ name: fmtMes(m.mes), Total: parseFloat(m.total||0), Pago: parseFloat(m.pago||0) }));
  const clientesMes = clientes.porMes.map(m => ({ name: fmtMes(m.mes), Clientes: m.total }));

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'1.5rem 1rem' }}>
      <h2 style={{ fontSize:20, fontWeight:700, color:'#0d2340', marginBottom:'0.3rem' }}>📊 Analytics</h2>
      <p style={{ fontSize:13, color:'#6b6b68', marginBottom:'1.5rem' }}>Visão geral do escritório</p>

      {/* KPIs principais */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:'1rem' }}>
        <KPI label="Total de Clientes" value={clientes.total} />
        <KPI label="Processos Ativos" value={processos.ativos} sub={`de ${processos.total} total`} />
        <KPI label="Taxa de Conversão" value={`${leads.taxaConversao}%`} sub={`${leads.total} leads`} color="#c5a859" />
        <KPI label="Honorários Totais" value={fmt(financeiro.totalHonorarios)} />
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:'1rem' }}>
        <KPI label="Pago" value={fmt(financeiro.totalPago)} color="#22c55e" />
        <KPI label="Pendente" value={fmt(financeiro.totalPendente)} color="#f59e0b" />
        <KPI label="Atrasado" value={fmt(financeiro.totalAtrasado)} color="#ef4444" />
        <KPI label="Docs Assinados" value={documentos.assinados} />
      </div>

      {/* Funil de Leads */}
      <Section title="Funil de Leads por Etapa">
        {etapaData.length === 0 ? <p style={{ color:'#6b6b68', fontSize:13 }}>Nenhum lead cadastrado ainda</p> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={etapaData} barSize={36}>
              <XAxis dataKey="name" tick={{ fontSize:12 }} />
              <YAxis tick={{ fontSize:12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#0d2340" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Origem dos Leads + Financeiro */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
        <Section title="Origem dos Leads">
          {origemData.length === 0 ? <p style={{ color:'#6b6b68', fontSize:13 }}>Sem dados</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={origemData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {origemData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Honorários por Status">
          {finData.length === 0 ? <p style={{ color:'#6b6b68', fontSize:13 }}>Sem honorários</p> : (
            <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
              {finData.map(f => (
                <div key={f.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#f8f7f3', borderRadius:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background: STATUS_COLOR[f.name.toLowerCase()]||'#6b7280' }}/>
                    <span style={{ fontSize:13, fontWeight:600 }}>{f.name}</span>
                    <span style={{ fontSize:11, color:'#6b6b68' }}>({f.qtd})</span>
                  </div>
                  <span style={{ fontSize:13, fontWeight:700, color: STATUS_COLOR[f.name.toLowerCase()]||'#333' }}>{fmt(f.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Honorários por mês */}
      {mesData.length > 0 && (
        <Section title="Honorários — Últimos 6 meses">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
              <XAxis dataKey="name" tick={{ fontSize:12 }} />
              <YAxis tick={{ fontSize:12 }} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend />
              <Bar dataKey="Total" fill="#0d2340" radius={[4,4,0,0]} />
              <Bar dataKey="Pago" fill="#22c55e" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Clientes novos por mês */}
      {clientesMes.length > 0 && (
        <Section title="Novos Clientes — Últimos 6 meses">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={clientesMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" />
              <XAxis dataKey="name" tick={{ fontSize:12 }} />
              <YAxis tick={{ fontSize:12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="Clientes" stroke="#c5a859" strokeWidth={2} dot={{ fill:'#c5a859' }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Processos por tribunal */}
      {processos.porTribunal.length > 0 && (
        <Section title="Processos por Tribunal">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={processos.porTribunal} layout="vertical" barSize={20}>
              <XAxis type="number" tick={{ fontSize:12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="tribunal" tick={{ fontSize:12 }} width={60} />
              <Tooltip />
              <Bar dataKey="total" fill="#c5a859" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}
    </div>
  );
}
