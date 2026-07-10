import { useState } from 'react';
import { Topbar, Card, Btn } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { Activity, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';

const NOMES = {
  banco:          { titulo: 'Banco de Dados',        desc: 'Clientes, processos e documentos' },
  storage:        { titulo: 'Armazenamento',          desc: 'Escrita e leitura de arquivos' },
  ia_anthropic:   { titulo: 'IA (Anthropic)',         desc: 'Petição IA, análise de prazos' },
  autentique:     { titulo: 'Autentique',             desc: 'Assinaturas digitais' },
  email_resend:   { titulo: 'Email (Resend)',         desc: 'Envio de emails e links' },
  whatsapp:       { titulo: 'WhatsApp (Evolution)',   desc: 'Notificações e comunicados' },
  datajud:        { titulo: 'DataJud (CNJ)',          desc: 'Monitoramento de processos' },
  conversor_pdf:  { titulo: 'Conversor PDF',          desc: 'Geração de PDFs (LibreOffice)' },
  backup:         { titulo: 'Backup (Google Drive)',  desc: 'Cópia diária do banco às 3h' },
  rotinas:        { titulo: 'Rotinas Internas',       desc: 'Prazos e assinaturas pendentes' },
};

export default function Diagnostico() {
  const [rodando, setRodando] = useState(false);
  const [relatorio, setRelatorio] = useState(null);
  const [fazendoBackup, setFazendoBackup] = useState(false);

  async function backupAgora() {
    setFazendoBackup(true);
    const toastId = toast.loading('Executando backup para o Google Drive...');
    try {
      const r = await api.post('/diagnostico/backup-agora', {}, { timeout: 120000 });
      toast.success('Backup concluído: ' + r.data.detalhe, { id: toastId, duration: 6000 });
      rodar(); // re-testa tudo para o card ficar verde
    } catch(e) {
      toast.error('Backup falhou: ' + (e.response?.data?.error || e.message), { id: toastId, duration: 10000 });
    } finally {
      setFazendoBackup(false);
    }
  }

  async function rodar() {
    setRodando(true);
    setRelatorio(null);
    try {
      const r = await api.post('/diagnostico/rodar', {}, { timeout: 120000 });
      setRelatorio(r.data);
      if (r.data.saudavel) toast.success('Todos os módulos operacionais!');
      else toast.error('Há módulos com problema — veja abaixo');
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erro ao rodar diagnóstico');
    } finally {
      setRodando(false);
    }
  }

  return (
    <div>
      <Topbar title="Diagnóstico do Sistema">
        <Btn onClick={rodar} disabled={rodando}>
          {rodando ? <><Loader2 size={14} className="spin" style={{ animation:'spin 1s linear infinite' }} /> Testando módulos...</> : <><RefreshCw size={14} /> Rodar diagnóstico</>}
        </Btn>
      </Topbar>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {!relatorio && !rodando && (
        <Card>
          <div style={{ textAlign:'center', padding:'3rem 1rem', color:'#6b6b68' }}>
            <Activity size={40} color="#c5a859" style={{ marginBottom:12 }} />
            <p style={{ fontSize:15, fontWeight:600, color:'#0d2340', margin:'0 0 6px' }}>Verificação completa do Veredo</p>
            <p style={{ fontSize:13, margin:0, maxWidth:480, marginLeft:'auto', marginRight:'auto' }}>
              Testa ao vivo: banco de dados, armazenamento, IA, Autentique, email, WhatsApp,
              DataJud, conversor de PDF, backup e rotinas internas. Leva ~20 segundos.
            </p>
          </div>
        </Card>
      )}

      {rodando && (
        <Card>
          <div style={{ textAlign:'center', padding:'3rem 1rem', color:'#6b6b68' }}>
            <Loader2 size={36} color="#c5a859" style={{ animation:'spin 1s linear infinite', marginBottom:12 }} />
            <p style={{ fontSize:14, margin:0 }}>Testando cada módulo ao vivo — aguarde até 30 segundos...</p>
          </div>
        </Card>
      )}

      {relatorio && (
        <>
          <Card>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 2px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {relatorio.saudavel
                  ? <CheckCircle2 size={26} color="#3b6d11" />
                  : <XCircle size={26} color="#a32d2d" />}
                <div>
                  <p style={{ margin:0, fontWeight:700, fontSize:16, color: relatorio.saudavel ? '#3b6d11' : '#a32d2d' }}>
                    {relatorio.saudavel ? 'Sistema 100% operacional' : 'Atenção: módulos com problema'}
                  </p>
                  <p style={{ margin:0, fontSize:12, color:'#6b6b68' }}>
                    {relatorio.resumo} — {new Date(relatorio.executado_em).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:12, marginTop:12 }}>
            {Object.entries(relatorio.resultados).map(([chave, r]) => {
              const info = NOMES[chave] || { titulo: chave, desc: '' };
              return (
                <div key={chave} style={{
                  background:'#fff', borderRadius:10, padding:'14px 16px',
                  border: `1.5px solid ${r.ok ? '#d4e6c3' : '#f3c6c6'}`,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    {r.ok ? <CheckCircle2 size={17} color="#3b6d11" /> : <XCircle size={17} color="#a32d2d" />}
                    <span style={{ fontWeight:700, fontSize:14, color:'#0d2340' }}>{info.titulo}</span>
                    <span style={{ marginLeft:'auto', fontSize:11, color:'#9a9a97' }}>{r.ms}ms</span>
                  </div>
                  <p style={{ margin:'0 0 4px', fontSize:11, color:'#9a9a97' }}>{info.desc}</p>
                  <p style={{ margin:0, fontSize:12.5, fontWeight: r.ok ? 400 : 600,
                    color: r.ok ? '#374151' : '#a32d2d', wordBreak:'break-word' }}>
                    {r.detalhe}
                  </p>
                  {chave === 'backup' && !r.ok && (
                    <button onClick={backupAgora} disabled={fazendoBackup}
                      style={{ marginTop:8, width:'100%', padding:'8px', background: fazendoBackup ? '#ccc' : '#0d2340',
                        color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor: fazendoBackup ? 'not-allowed' : 'pointer' }}>
                      {fazendoBackup ? 'Executando backup...' : '▶ Fazer backup agora (mostra o erro real)'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
