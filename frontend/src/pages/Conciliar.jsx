import { useState, useRef } from 'react';
import { Topbar, Btn } from '../components/UI.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { UploadCloud, CheckCircle2, Archive, PlusCircle, HelpCircle } from 'lucide-react';

// Extrai CNJs (e nome, se vier no formato "CNJ - Nome" ou "CNJ<tab>Nome") de texto colado
function parseTexto(txt) {
  const cnjRe = /\d{7}[-.]?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/;
  const itens = [];
  const vistos = new Set();
  for (const linha of String(txt).split(/\n+/)) {
    const m = linha.match(cnjRe);
    if (!m) continue;
    const dig = m[0].replace(/\D/g, '');
    if (vistos.has(dig)) continue;
    vistos.add(dig);
    const nome = linha.replace(m[0], '').replace(/[-–—\t|:;]+/g, ' ').replace(/\s+/g, ' ').trim();
    itens.push({ cnj: m[0], nome: nome.length >= 3 ? nome : '' });
  }
  return itens;
}

export default function Conciliar() {
  const [texto, setTexto] = useState('');
  const [job, setJob] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [sel, setSel] = useState({ importar: {}, arquivar: {} });
  const poll = useRef(null);

  const itens = parseTexto(texto);

  async function iniciar() {
    if (!itens.length) return toast.error('Cole a lista de processos (um por linha)');
    setRodando(true); setJob(null);
    try {
      const r = await api.post('/processos/conciliar-lista', { itens });
      toast(`Analisando ${r.data.total} processos no DataJud — ~1 min a cada 40`, { icon: '🔎', duration: 6000 });
      clearInterval(poll.current);
      poll.current = setInterval(async () => {
        try {
          const s = await api.get(`/processos/conciliar-lista/status/${r.data.jobId}`);
          setJob(s.data);
          if (!s.data.rodando) {
            clearInterval(poll.current); setRodando(false);
            // pré-marca tudo: importar ativos novos, arquivar concluídos
            const imp = {}, arq = {};
            (s.data.ativos_novos || []).forEach(x => imp[x.cnj] = true);
            (s.data.concluidos || []).forEach(x => arq[x.cnj] = true);
            setSel({ importar: imp, arquivar: arq });
          }
        } catch { clearInterval(poll.current); setRodando(false); }
      }, 3000);
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); setRodando(false); }
  }

  async function aplicar() {
    const importar = (job.ativos_novos || []).filter(x => sel.importar[x.cnj]);
    const arquivar_concluidos = (job.concluidos || []).filter(x => sel.arquivar[x.cnj]);
    if (!importar.length && !arquivar_concluidos.length) return toast.error('Nada selecionado');
    if (!window.confirm(
      `Confirmar:\n• Importar ${importar.length} processo(s) novo(s) (ativos)\n` +
      `• Arquivar ${arquivar_concluidos.length} concluído(s) (registro histórico)\n\n` +
      `Os já existentes no Veredo não são tocados.`
    )) return;
    try {
      const r = await api.post('/processos/conciliar-lista/aplicar', { importar, arquivar_concluidos });
      toast.success(`${r.data.criados} importado(s), ${r.data.arquivados} arquivado(s)`, { duration: 8000 });
      setJob(null); setTexto('');
    } catch(e) { toast.error(e.response?.data?.error || 'Erro'); }
  }

  const Secao = ({ icone, cor, titulo, itens, tipo, desc }) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #eceade' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {icone}
        <span style={{ fontWeight: 800, fontSize: 14, color: cor }}>{titulo} ({itens.length})</span>
      </div>
      <div style={{ fontSize: 12, color: '#6b6b68', marginBottom: 10 }}>{desc}</div>
      {itens.length === 0 && <div style={{ fontSize: 12.5, color: '#9a9a97' }}>Nenhum.</div>}
      {itens.map(x => (
        <div key={x.cnj} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px dashed #f0eee4' }}>
          {tipo && (
            <input type="checkbox" checked={!!sel[tipo][x.cnj]}
              onChange={() => setSel(s => ({ ...s, [tipo]: { ...s[tipo], [x.cnj]: !s[tipo][x.cnj] } }))}
              style={{ width: 15, height: 15, accentColor: cor }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2035' }}>
              {x.nome || '(sem nome)'} <span style={{ color: '#9a9a97', fontWeight: 400 }}>· {x.cnj}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b6b68' }}>
              {x.etapa && `no Veredo: ${x.etapa}`}
              {x.ultimo && `${x.ultimo.descricao} · ${String(x.ultimo.data).slice(0,10)}`}
              {x.sem_datajud && 'sem dados no DataJud — importar assim mesmo'}
              {x.motivo && `${x.motivo}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <Topbar title="Conciliar lista de processos" />
      <div style={{ maxWidth: 860 }}>
        {!job && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #eceade' }}>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginTop: 0 }}>
              Cole a lista de processos (um número CNJ por linha; se houver nome, use "número - nome").
              O sistema verifica o que <b>já está no Veredo</b> (não mexe), consulta o <b>DataJud</b> para
              identificar os <b>concluídos</b> (arquiva) e os <b>ativos novos</b> (importa).
            </p>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={10}
              placeholder={"0876115-50.2025.8.19.0001 - Rafael Fuzi\n0903877-41.2025.8.19.0001\n..."}
              style={{ width: '100%', padding: 12, borderRadius: 9, border: '1px solid #d0cfc7', fontSize: 13, fontFamily: 'monospace' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 12.5, color: '#6b6b68' }}>{itens.length} processo(s) detectado(s)</span>
              <Btn onClick={iniciar} disabled={rodando || !itens.length}>
                {rodando ? 'Analisando...' : 'Analisar lista'}
              </Btn>
            </div>
          </div>
        )}

        {rodando && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, marginTop: 14, border: '1px solid #eceade' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f2035', marginBottom: 8 }}>
              🔎 Consultando o DataJud... {job?.processados || 0}/{job?.total || itens.length}
            </div>
            <div style={{ background: '#e5e7eb', borderRadius: 10, height: 8, overflow: 'hidden' }}>
              <div style={{ background: '#0f2035', height: '100%', transition: 'width .5s',
                width: `${((job?.processados || 0) / (job?.total || itens.length)) * 100}%` }} />
            </div>
          </div>
        )}

        {job && !rodando && (
          <div style={{ marginTop: 14 }}>
            <Secao icone={<CheckCircle2 size={17} color="#1f845a" />} cor="#1f845a" titulo="Concluídos — arquivar"
              itens={job.concluidos || []} tipo="arquivar"
              desc="Encerrados na origem (baixa/arquivamento/trânsito). Entram como registro histórico, fora do quadro." />
            <Secao icone={<PlusCircle size={17} color="#0c66e4" />} cor="#0c66e4" titulo="Ativos novos — importar"
              itens={job.ativos_novos || []} tipo="importar"
              desc="Não estão no Veredo e seguem em andamento. Entram na coluna 'Sem etapa' para você posicionar." />
            <Secao icone={<Archive size={17} color="#6b6b68" />} cor="#6b6b68" titulo="Já no Veredo — manter"
              itens={job.ja_no_veredo || []} tipo={null}
              desc="Já cadastrados. Nada é alterado — a organização atual é preservada." />
            {(job.sem_dados?.length > 0) && (
              <Secao icone={<HelpCircle size={17} color="#9a7a2a" />} cor="#9a7a2a" titulo="Sem dados"
                itens={job.sem_dados} tipo={null} desc="Número inválido ou erro na consulta." />
            )}

            <div style={{ position: 'sticky', bottom: 0, background: '#fbfbf9', padding: '12px 0', borderTop: '1px solid #eceade',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: '#6b6b68' }}>
                Importar <b>{Object.values(sel.importar).filter(Boolean).length}</b> · Arquivar <b>{Object.values(sel.arquivar).filter(Boolean).length}</b>
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="outline" onClick={() => { setJob(null); }}>Voltar</Btn>
                <Btn onClick={aplicar}>Aplicar</Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
