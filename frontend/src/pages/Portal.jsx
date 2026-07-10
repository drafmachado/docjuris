// Portal do Cliente — página pública, acesso por CPF + código WhatsApp
import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Scale, Lock, FileText, Gavel, CalendarClock, LogOut, CheckCircle2, Clock3 } from 'lucide-react';

const API = '/api/portal';
const cores = { navy: '#0f2035', gold: '#c5a859', bg: '#f5f5f0' };

function fmtData(d) { try { return new Date(d + (d?.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR'); } catch { return d; } }

export default function Portal() {
  const [etapa, setEtapa] = useState('cpf'); // cpf | codigo | dados
  const [cpf, setCpf] = useState('');
  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState(null);
  const [token, setToken] = useState(null);

  function maskCPF(v) {
    return v.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  async function solicitarCodigo() {
    if (cpf.replace(/\D/g, '').length !== 11) return toast.error('Informe o CPF completo');
    setCarregando(true);
    try {
      const r = await fetch(`${API}/solicitar-codigo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Se o CPF estiver cadastrado, o código chegou no seu WhatsApp');
      setEtapa('codigo');
    } catch(e) { toast.error(e.message || 'Erro. Tente novamente.'); }
    finally { setCarregando(false); }
  }

  async function validar() {
    if (codigo.trim().length !== 6) return toast.error('O código tem 6 dígitos');
    setCarregando(true);
    try {
      const r = await fetch(`${API}/validar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, codigo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setToken(data.token);
      const r2 = await fetch(`${API}/meus-dados`, { headers: { Authorization: `Bearer ${data.token}` } });
      const dados2 = await r2.json();
      if (!r2.ok) throw new Error(dados2.error);
      setDados(dados2);
      setEtapa('dados');
    } catch(e) { toast.error(e.message || 'Código inválido'); }
    finally { setCarregando(false); }
  }

  function sair() { setEtapa('cpf'); setCpf(''); setCodigo(''); setDados(null); setToken(null); }

  const SITUACAO_DOC = {
    assinado:              { label: '✓ Assinado',      cor: '#3b6d11', bg: '#eaf3de' },
    aguardando_assinatura: { label: 'Aguardando sua assinatura', cor: '#854f0b', bg: '#faeeda' },
    em_preparo:            { label: 'Em preparo',      cor: '#185fa5', bg: '#e8f0fe' },
  };

  return (
    <div style={{ minHeight: '100vh', background: cores.bg, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <Toaster position="top-center" />

      {/* Topo */}
      <div style={{ background: cores.navy, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Scale size={22} color={cores.gold} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: '0.02em' }}>Machado Advocacia</div>
          <div style={{ color: cores.gold, fontSize: 11, letterSpacing: '0.15em' }}>PORTAL DO CLIENTE</div>
        </div>
      </div>

      <div style={{ maxWidth: etapa === 'dados' ? 820 : 420, margin: '0 auto', padding: '2rem 1rem' }}>

        {/* ─── Etapa 1: CPF ─── */}
        {etapa === 'cpf' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '2rem 1.6rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <Lock size={26} color={cores.gold} style={{ marginBottom: 10 }} />
            <h2 style={{ margin: '0 0 6px', fontSize: 19, color: cores.navy }}>Acompanhe seu processo</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#6b6b68', lineHeight: 1.5 }}>
              Informe seu CPF. Enviaremos um código de acesso para o WhatsApp cadastrado no escritório.
            </p>
            <input
              value={cpf}
              onChange={e => setCpf(maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16,
                border: '1.5px solid #d0cfc7', borderRadius: 10, marginBottom: 12, textAlign: 'center', letterSpacing: '0.05em' }}
            />
            <button onClick={solicitarCodigo} disabled={carregando}
              style={{ width: '100%', padding: '13px', background: carregando ? '#ccc' : cores.navy,
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              {carregando ? 'Enviando...' : 'Receber código no WhatsApp'}
            </button>
          </div>
        )}

        {/* ─── Etapa 2: Código ─── */}
        {etapa === 'codigo' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '2rem 1.6rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, color: cores.navy }}>Digite o código</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#6b6b68' }}>
              Enviamos um código de 6 dígitos para o WhatsApp cadastrado. Válido por 5 minutos.
            </p>
            <input
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 24,
                border: '1.5px solid #d0cfc7', borderRadius: 10, marginBottom: 12, textAlign: 'center', letterSpacing: '0.4em', fontWeight: 700 }}
            />
            <button onClick={validar} disabled={carregando}
              style={{ width: '100%', padding: '13px', background: carregando ? '#ccc' : cores.navy,
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              {carregando ? 'Verificando...' : 'Entrar'}
            </button>
            <button onClick={() => setEtapa('cpf')}
              style={{ width: '100%', padding: '10px', background: 'none', color: '#6b6b68',
                border: 'none', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
              Voltar / Reenviar código
            </button>
          </div>
        )}

        {/* ─── Etapa 3: Dados ─── */}
        {etapa === 'dados' && dados && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: cores.navy }}>Olá, {dados.cliente.nome.split(' ')[0]}!</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b6b68' }}>Aqui está a situação atualizada dos seus casos.</p>
              </div>
              <button onClick={sair} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none',
                border: '1px solid #d0cfc7', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: '#6b6b68' }}>
                <LogOut size={13} /> Sair
              </button>
            </div>

            {/* Prazos próximos */}
            {dados.prazos.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 14, color: cores.navy, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarClock size={15} color={cores.gold} /> Próximas datas importantes
                </h3>
                {dados.prazos.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                    borderBottom: i < dados.prazos.length - 1 ? '1px solid #f0efe8' : 'none', fontSize: 13 }}>
                    <span>{p.titulo}</span>
                    <span style={{ fontWeight: 700, color: cores.navy }}>{fmtData(p.data_limite)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Processos */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, color: cores.navy, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Gavel size={15} color={cores.gold} /> Seus processos ({dados.processos.length})
              </h3>
              {dados.processos.length === 0 && <p style={{ fontSize: 13, color: '#9a9a97' }}>Nenhum processo cadastrado ainda.</p>}
              {dados.processos.map(p => (
                <div key={p.id} style={{ border: '1px solid #eceade', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: cores.navy, marginBottom: 2 }}>{p.numero_cnj}</div>
                  <div style={{ fontSize: 12, color: '#6b6b68', marginBottom: 8 }}>
                    {p.tribunal} {p.polo_passivo ? `• contra ${p.polo_passivo}` : ''}
                  </div>
                  {p.andamentos.length > 0 && (
                    <div style={{ background: '#fafaf6', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9a9a97', marginBottom: 6, letterSpacing: '0.05em' }}>ÚLTIMAS MOVIMENTAÇÕES</div>
                      {p.andamentos.map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '4px 0', color: '#374151' }}>
                          <span style={{ color: '#9a9a97', flexShrink: 0, fontWeight: 600 }}>{fmtData(a.data)}</span>
                          <span>{a.descricao}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Documentos */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, color: cores.navy, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={15} color={cores.gold} /> Seus documentos
              </h3>
              {dados.documentos.length === 0 && <p style={{ fontSize: 13, color: '#9a9a97' }}>Nenhum documento ainda.</p>}
              {dados.documentos.map(d => {
                const s = SITUACAO_DOC[d.situacao] || SITUACAO_DOC.em_preparo;
                return (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 0', borderBottom: '1px solid #f0efe8', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{d.nome}</div>
                      <div style={{ fontSize: 11, color: '#9a9a97' }}>{fmtData(d.created_at)}</div>
                    </div>
                    <span style={{ background: s.bg, color: s.cor, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#9a9a97', marginTop: 18 }}>
              Dúvidas? Fale conosco: (11) 96735-1199 • (21) 99771-4178
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
