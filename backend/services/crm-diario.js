// backend/services/crm-diario.js
// Rotina diária de CRM por WhatsApp (roda de manhã):
//   1. Lê as conversas com movimento nas últimas 24h, em todas as conexões
//   2. Número desconhecido → IA avalia se é potencial cliente → cria LEAD no funil
//   3. Lead existente → IA avalia o desfecho → avança etapa; se fechou, CONVERTE em cliente
//   4. Cliente existente → IA avalia se pede SERVIÇO NOVO → abre lead adicional
// Tudo é registrado como atividade do lead; nada é apagado.
import { getDB } from '../db.js';

// Estado observável da execução (a tela acompanha por polling)
export const statusCrmDiario = {
  rodando: false, fase: null, linha: null, linhas_total: 0, linha_atual: 0,
  total: 0, processadas: 0,
  leads_novos: 0, leads_atualizados: 0, convertidos: 0, servicos_novos: 0,
  ultimos: [], iniciado_em: null, concluido_em: null,
};

const JANELA_HORAS = 26;      // margem sobre 24h
const MAX_CONVERSAS = 80;     // teto diário (controle de custo de IA)

function evoUrl() {
  let u = process.env.EVOLUTION_API_URL || '';
  if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
  return u;
}
const evoHeaders = () => ({ 'apikey': process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' });
const sufixo = t => String(t || '').replace(/\D/g, '').slice(-8);

// Todas as conexões do escritório (os 3 números). Só as conectadas são lidas;
// as caídas são avisadas, porque uma linha offline = leads perdidos naquele número.
async function instancias() {
  try {
    const r = await fetch(`${evoUrl()}/instance/fetchInstances`, { headers: evoHeaders() });
    if (!r.ok) throw new Error(r.status);
    const lista = await r.json();
    const todas = (Array.isArray(lista) ? lista : [lista]).map(x => {
      const i = x?.instance || x || {};
      const owner = String(i.owner || i.ownerJid || '').split('@')[0].replace(/\D/g, '');
      return {
        nome: i.instanceName || i.name,
        estado: String(i.connectionStatus || i.status || i.state || '').toLowerCase(),
        numero: owner || null,
      };
    }).filter(x => x.nome);

    const conectadas = todas.filter(x => ['open', 'connected'].includes(x.estado));
    const caidas = todas.filter(x => !['open', 'connected'].includes(x.estado));
    if (caidas.length) {
      console.warn(`⚠️ CRM diário: ${caidas.length} conexão(ões) DESCONECTADA(S) — sem leitura: ${caidas.map(c => c.nome).join(', ')}`);
    }
    console.log(`📱 CRM diário lendo ${conectadas.length} linha(s): ${conectadas.map(c => c.nome + (c.numero ? ` (${c.numero})` : '')).join(', ')}`);
    return { conectadas: conectadas.map(c => c.nome), caidas: caidas.map(c => c.nome) };
  } catch {
    return { conectadas: [process.env.EVOLUTION_INSTANCE || 'docjuris'], caidas: [] };
  }
}

// Conversas com mensagens recebidas na janela
async function conversasRecentes(inst, desdeMs) {
  const out = [];
  try {
    const rc = await fetch(`${evoUrl()}/chat/findChats/${inst}`, {
      method: 'POST', headers: evoHeaders(), body: JSON.stringify({}),
    });
    if (!rc.ok) return out;
    const bruto = await rc.json();
    const chats = (Array.isArray(bruto) ? bruto : (bruto.chats || bruto.records || []))
      .filter(ch => {
        const jid = ch.remoteJid || ch.id || '';
        return jid && !jid.endsWith('@g.us') && !jid.includes('broadcast') && !jid.includes('status');
      });

    for (const ch of chats.slice(0, 250)) {
      const jid = ch.remoteJid || ch.id;
      const rm = await fetch(`${evoUrl()}/chat/findMessages/${inst}`, {
        method: 'POST', headers: evoHeaders(),
        body: JSON.stringify({ where: { key: { remoteJid: jid } }, limit: 20 }),
      });
      if (!rm.ok) continue;
      const bm = await rm.json();
      const regs = Array.isArray(bm) ? bm : (bm.messages?.records || bm.records || bm.messages || []);

      const msgs = regs.map(m => {
        const ts = Number(m.messageTimestamp || m.timestamp || 0) * (String(m.messageTimestamp).length > 11 ? 1 : 1000);
        const texto = m.message?.conversation || m.message?.extendedTextMessage?.text
          || m.message?.imageMessage?.caption || (m.message?.audioMessage ? '[áudio]' : '')
          || (m.message?.documentMessage ? '[documento]' : '');
        return { fromMe: !!m.key?.fromMe, texto: String(texto).slice(0, 300), ts, nome: m.pushName || '' };
      }).filter(m => m.texto);

      const recebidasNaJanela = msgs.some(m => !m.fromMe && m.ts >= desdeMs);
      if (!recebidasNaJanela) continue;

      out.push({
        jid, numero: jid.split('@')[0].replace(/\D/g, ''),
        nome: ch.pushName || ch.name || msgs.find(m => !m.fromMe && m.nome)?.nome || '',
        mensagens: msgs.sort((a, b) => a.ts - b.ts).slice(-15),
      });
      await new Promise(r => setTimeout(r, 150));
      if (out.length >= MAX_CONVERSAS) break;
    }
  } catch (e) {
    console.error(`  CRM diário — erro na instância ${inst}:`, e.message);
  }
  return out;
}

async function perguntarIA(prompt, maxTokens = 320) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`IA ${r.status}`);
  const d = await r.json();
  const txt = (d.content || []).map(b => b.text || '').join('');
  return JSON.parse(txt.replace(/```json|```/g, '').trim());
}

const transcrever = c => c.mensagens
  .map(m => `[${m.fromMe ? 'ADVOGADA' : 'CONTATO'}] ${m.texto}`).join('\n').slice(0, 2500);

// ─── Rotina principal ────────────────────────────────────────────────────────
export async function rodarCrmDiario() {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.EVOLUTION_API_KEY) {
    console.log('⏭️  CRM diário pulado (credenciais ausentes)');
    return { pulado: true };
  }

  const db = getDB();
  const desde = Date.now() - JANELA_HORAS * 60 * 60 * 1000;
  const resumo = { conversas: 0, leads_novos: 0, leads_atualizados: 0, convertidos: 0, servicos_novos: 0, erros: 0 };

  Object.assign(statusCrmDiario, {
    rodando: true, fase: 'consultando as linhas de WhatsApp', linha: null,
    linhas_total: 0, linha_atual: 0, total: 0, processadas: 0,
    leads_novos: 0, leads_atualizados: 0, convertidos: 0, servicos_novos: 0,
    ultimos: [], iniciado_em: new Date().toISOString(), concluido_em: null,
  });

  console.log('🔄 CRM diário: lendo conversas das últimas 24h...');

  const clientes = db.prepare(`SELECT id, nome, telefone FROM clients WHERE telefone IS NOT NULL AND telefone != ''`).all();
  const leads = db.prepare(`SELECT id, nome, telefone, etapa, area, observacoes FROM leads WHERE telefone IS NOT NULL AND telefone != ''`).all();
  const mapaClientes = new Map(clientes.map(c => [sufixo(c.telefone), c]));
  const mapaLeads = new Map(leads.filter(l => !['contratado', 'perdido'].includes(l.etapa)).map(l => [sufixo(l.telefone), l]));
  const leadsFechados = new Set(leads.filter(l => ['contratado', 'perdido'].includes(l.etapa)).map(l => sufixo(l.telefone)));

  const insAtividade = db.prepare(`INSERT INTO leads_atividades (lead_id, tipo, descricao) VALUES (?, 'whatsapp', ?)`);

  const linhas = await instancias();
  resumo.linhas_lidas = linhas.conectadas.length;
  resumo.linhas_caidas = linhas.caidas;

  statusCrmDiario.linhas_total = linhas.conectadas.length;

  for (const inst of linhas.conectadas) {
    statusCrmDiario.linha_atual++;
    statusCrmDiario.linha = inst;
    statusCrmDiario.fase = `buscando conversas de ${inst}`;
    const conversas = await conversasRecentes(inst, desde);
    statusCrmDiario.total += conversas.length;
    statusCrmDiario.fase = `analisando conversas de ${inst}`;
    console.log(`  ${inst}: ${conversas.length} conversa(s) com movimento`);

    for (const conv of conversas) {
      resumo.conversas++;
      statusCrmDiario.processadas++;
      const suf = sufixo(conv.numero);
      const transcricao = transcrever(conv);
      if (conv.mensagens.filter(m => !m.fromMe).length === 0) continue;

      try {
        const cliente = mapaClientes.get(suf);
        const lead = mapaLeads.get(suf);

        // ─── CASO 1: LEAD EM ANDAMENTO — acompanhar até o desfecho ───
        if (lead) {
          const a = await perguntarIA(
`Você acompanha o funil de vendas de um escritório de advocacia.
Lead: "${lead.nome}" — etapa atual: "${lead.etapa}" (contato → consulta → proposta → contratado/perdido)
Contexto anterior: ${String(lead.observacoes || '').slice(0, 300)}

Conversa mais recente no WhatsApp:
${transcricao}

Responda APENAS JSON: {"etapa":"contato|consulta|proposta|contratado|perdido","mudou":true|false,"resumo":"1 frase sobre o andamento da negociação"}
Regras: "contratado" só se o cliente CLARAMENTE aceitou contratar/assinou/pagou. "perdido" só se recusou explicitamente ou desistiu. Na dúvida, mantenha a etapa atual e mudou=false.`);

          if (a.mudou && a.etapa && a.etapa !== lead.etapa) {
            db.prepare(`UPDATE leads SET etapa = ?, updated_at = datetime('now') WHERE id = ?`).run(a.etapa, lead.id);
            insAtividade.run(lead.id, `Análise diária do WhatsApp: ${lead.etapa} → ${a.etapa}. ${a.resumo || ''}`);
            resumo.leads_atualizados++;
            statusCrmDiario.leads_atualizados++;

            // Fechou positivamente → vira cliente
            if (a.etapa === 'contratado') {
              const jaCliente = mapaClientes.get(suf);
              if (!jaCliente) {
                const r = db.prepare(`
                  INSERT INTO clients (nome, telefone, observacoes, advogadas, created_by)
                  VALUES (?, ?, ?, 'ambas', NULL)
                `).run(lead.nome, lead.telefone,
                       `Convertido automaticamente do funil (negociação fechada no WhatsApp).\nResumo: ${a.resumo || ''}\n⚠️ COMPLETAR CADASTRO (CPF, endereço, email)`);
                mapaClientes.set(suf, { id: r.lastInsertRowid, nome: lead.nome, telefone: lead.telefone });
                insAtividade.run(lead.id, `✅ Convertido em cliente automaticamente (ID ${r.lastInsertRowid}) — completar cadastro`);
                resumo.convertidos++;
                statusCrmDiario.convertidos++;
                statusCrmDiario.ultimos.unshift({ tipo: 'convertido', nome: lead.nome, resumo: a.resumo || '' });
                console.log(`  ✅ Lead "${lead.nome}" fechou → cliente criado`);
              }
              mapaLeads.delete(suf);
              leadsFechados.add(suf);
            }
          } else {
            insAtividade.run(lead.id, `Análise diária: ${a.resumo || 'conversa sem mudança de etapa'}`);
          }
          continue;
        }

        // ─── CASO 2: CLIENTE EXISTENTE — detectar demanda de serviço novo ───
        if (cliente) {
          const a = await perguntarIA(
`Você monitora conversas de clientes de um escritório de advocacia para identificar NOVAS demandas.
Cliente já existente: "${cliente.nome}"

Conversa recente no WhatsApp:
${transcricao}

O cliente está pedindo um SERVIÇO JURÍDICO NOVO (caso diferente do que já é atendido), ou apenas tratando do caso em andamento / assunto administrativo?
Responda APENAS JSON: {"servico_novo":true|false,"area":"saude|civel|consumidor|inventario|familia|trabalhista|outro","resumo":"1 frase: qual a nova demanda"}
Seja conservador: só true se ficar claro que é um caso/assunto jurídico NOVO.`);

          if (a.servico_novo) {
            // Evita duplicar lead de serviço novo em aberto para o mesmo telefone
            const jaAberto = db.prepare(`
              SELECT id FROM leads WHERE telefone = ? AND etapa NOT IN ('contratado','perdido')
            `).get(cliente.telefone);
            if (!jaAberto) {
              const r = db.prepare(`
                INSERT INTO leads (nome, telefone, area, origem, etapa, observacoes)
                VALUES (?, ?, ?, 'cliente-existente', 'contato', ?)
              `).run(`${cliente.nome} (novo serviço)`, cliente.telefone, a.area || 'outro',
                     `Demanda nova detectada no WhatsApp em ${new Date().toLocaleDateString('pt-BR')}: ${a.resumo || ''}`);
              insAtividade.run(r.lastInsertRowid, `Lead aberto pela análise diária — cliente existente pediu serviço novo: ${a.resumo || ''}`);
              mapaLeads.set(suf, { id: r.lastInsertRowid, nome: cliente.nome, telefone: cliente.telefone, etapa: 'contato' });
              resumo.servicos_novos++;
              statusCrmDiario.servicos_novos++;
              statusCrmDiario.ultimos.unshift({ tipo: 'servico', nome: cliente.nome, resumo: a.resumo || '' });
              console.log(`  🆕 Serviço novo de cliente: ${cliente.nome}`);
            }
          }
          continue;
        }

        // ─── CASO 3: NÚMERO DESCONHECIDO — é potencial cliente? ───
        if (leadsFechados.has(suf)) continue; // negociação já encerrada antes

        const a = await perguntarIA(
`Você triagem contatos de WhatsApp de um escritório de advocacia (Dra. Andreia Machado).

Contato: "${conv.nome || conv.numero}"
Conversa:
${transcricao}

Este contato é um POTENCIAL CLIENTE (busca ajuda jurídica, consulta, pergunta honorários) ou é assunto pessoal/fornecedor/spam/irrelevante?
Responda APENAS JSON: {"potencial_cliente":true|false,"nome":"nome real da pessoa se identificável, senão o nome do contato","area":"saude|civel|consumidor|inventario|familia|trabalhista|outro","resumo":"1 frase: o que a pessoa procura"}`);

        if (a.potencial_cliente) {
          const r = db.prepare(`
            INSERT INTO leads (nome, telefone, area, origem, etapa, observacoes)
            VALUES (?, ?, ?, 'whatsapp', 'contato', ?)
          `).run((a.nome || conv.nome || `WhatsApp ${conv.numero}`).slice(0, 120), conv.numero,
                 a.area || 'outro',
                 `Lead criado pela análise diária do WhatsApp em ${new Date().toLocaleDateString('pt-BR')}.\n${a.resumo || ''}`);
          insAtividade.run(r.lastInsertRowid, `Primeiro contato analisado: ${a.resumo || ''}`);
          mapaLeads.set(suf, { id: r.lastInsertRowid, nome: a.nome, telefone: conv.numero, etapa: 'contato' });
          resumo.leads_novos++;
          statusCrmDiario.leads_novos++;
          statusCrmDiario.ultimos.unshift({ tipo: 'lead', nome: a.nome || conv.numero, resumo: a.resumo || '' });
          console.log(`  🎯 Lead novo: ${a.nome || conv.numero} — ${a.resumo || ''}`);
        }
      } catch (e) {
        resumo.erros++;
        console.error(`  Erro na conversa ${conv.numero}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 700));
    }
  }

  Object.assign(statusCrmDiario, { rodando: false, fase: 'concluído', concluido_em: new Date().toISOString() });

  console.log(`✅ CRM diário concluído: ${resumo.leads_novos} lead(s) novo(s), ${resumo.leads_atualizados} atualizado(s), ${resumo.convertidos} convertido(s) em cliente, ${resumo.servicos_novos} serviço(s) novo(s)`);

  // Registro para o Diagnóstico
  try {
    db.prepare(`INSERT INTO crm_diario_log (executado_em, resumo) VALUES (datetime('now'), ?)`)
      .run(JSON.stringify(resumo));
  } catch {}

  // Relatório por email
  try {
    if (process.env.RESEND_API_KEY && (resumo.leads_novos || resumo.convertidos || resumo.servicos_novos)) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Veredo <docjuris@advmachado.adv.br>',
        to: process.env.ALERT_EMAIL || 'dra.andreia@advmachado.adv.br',
        subject: `🎯 CRM diário — ${resumo.leads_novos} novo(s) lead(s), ${resumo.convertidos} convertido(s)`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px">
          <div style="background:#0f2035;padding:18px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">🎯 Análise diária do WhatsApp</h2></div>
          <div style="padding:18px;background:#f9fafb;border:1px solid #e5e7eb">
            <p><b>${resumo.conversas}</b> conversa(s) com movimento nas últimas 24h</p>
            <ul>
              <li><b>${resumo.leads_novos}</b> lead(s) novo(s) no funil</li>
              <li><b>${resumo.leads_atualizados}</b> negociação(ões) com etapa atualizada</li>
              <li><b>${resumo.convertidos}</b> convertido(s) em cliente ✅</li>
              <li><b>${resumo.servicos_novos}</b> cliente(s) pedindo serviço novo</li>
            </ul>
            <p style="font-size:12.5px">Linhas lidas: <b>${resumo.linhas_lidas || 0}</b></p>
            ${(resumo.linhas_caidas || []).length ? `<p style="background:#fdf2f2;border-left:4px solid #dc2626;padding:8px 12px;color:#7f1d1d"><b>⚠️ Atenção:</b> ${resumo.linhas_caidas.length} conexão(ões) de WhatsApp desconectada(s) (${resumo.linhas_caidas.join(', ')}) — mensagens desses números NÃO foram lidas. Reconecte na tela WhatsApp do Veredo.</p>` : ''}
            <p style="font-size:12px;color:#6b7280">Acesse o Funil de Leads no Veredo para os detalhes.</p>
          </div></div>`,
      });
    }
  } catch (e) { console.error('Email CRM diário:', e.message); }

  return resumo;
}

