// api/chat.js

// 1. MEMÓRIA DE SESSÃO AVANÇADA
// Nota Arquitetural: Em ambientes serverless (Vercel), variáveis globais podem resetar no cold start.
// Para escala massiva, substitua este Map por um Redis (ex: Upstash). Para o escopo atual, o Map atende bem.
const sessionCache = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutos

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessionCache.entries()) {
    if (now - session.lastUpdated > SESSION_TTL) {
      sessionCache.delete(key);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    cleanExpiredSessions();

    let { message, sessionId } = req.body || {};
    
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem vazia ou inválida." });
    }

    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    const userMessage = message.trim();
    if (userMessage.length > 300) {
      return res.status(400).json({ reply: "Sua mensagem é muito longa. Por favor, seja mais direto para eu poder ajudar melhor." });
    }

    // 2. NORMALIZAÇÃO DE TEXTO
    const msgLimpa = userMessage
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // 3. RECUPERAR MEMÓRIA DA SESSÃO ATUAL
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = { intent: null, step: 0, lastTopic: null, lastUpdated: Date.now() };
    } else {
      session.lastUpdated = Date.now();
    }

    // 4. DETECÇÃO DE CONTEXTO E CONTINUIDADE
    const regexContinuacao = /\b(e agr|agr|e agora|agora|depois|pr[oó]ximo( passo)?|pronto|j[aá] fiz|coloquei( o valor)?|adicionei|enviei|e a[ií]|fiz( isso)?|sim|ok|achei|encontrei|continue|certo|entendi)\b/i;
    const isContinuation = regexContinuacao.test(msgLimpa) && msgLimpa.split(' ').length <= 5;
    const isErrorQuery = /\b(errar|errei|erro|corrigir|se der erro|consertar|fiz errado|esqueci)\b/.test(msgLimpa);

    // 5. FLUXOS GUIADOS LOCAIS RIGOROSOS
    const flows = {
      sangria: {
        1: { reply: "Para registrar uma sangria:\n\n1. Acesse 'Registrar Operação'.\n2. Escolha o tipo 'Sangria'.\n\nVocê conseguiu encontrar essa tela?", chips: ["Sim, encontrei", "Onde fica?"] },
        2: { reply: "Ótimo! Agora informe o valor exato que está enviando, escreva a observação (motivo) e, se necessário, ajuste a 'Data da operação' (caso seja retroativa). Já preencheu tudo?", chips: ["Já preenchi", "Errei o valor, e agora?"] },
        3: { reply: "Perfeito. Basta clicar em 'Enviar Registro'. A sangria ficará com o status 'Em Análise', aguardando o escritório.\n\nFicou claro?", chips: ["Sim, entendi", "O que significa Em Análise?"] },
        4: { reply: "Assim que o escritório aprovar, a sangria SOMA automaticamente no seu 'Físico (Confirmado)'.\n\nPosso ajudar com mais alguma dúvida sobre o sistema?", chips: ["Como lançar despesa", "Dúvida sobre saldo", "Não, obrigado"] },
        erro: { reply: "Se você errar o valor ou a observação na sangria, não se preocupe. Avise o escritório: eles podem modificar o valor na hora de aprovar ou recusar para que você lance novamente." }
      },
      despesa: {
        1: { reply: "Para registrar uma despesa:\n\n1. Acesse 'Registrar Operação'.\n2. Escolha 'Retirada de Despesa'.\n\nConseguiu achar?", chips: ["Sim, achei", "Não estou achando"] },
        2: { reply: "Legal. Informe o valor gasto, escreva o detalhe da despesa na observação e ajuste a data se ocorreu em outro dia. Tudo certo até aqui?", chips: ["Tudo certo", "E se eu errar?"] },
        3: { reply: "Agora é só clicar em 'Enviar Registro'. A despesa ficará 'Em Análise' pelo escritório. Entendido?", chips: ["Entendi", "Quando desconta do saldo?"] },
        4: { reply: "Quando o escritório aprovar, o valor será SUBTRAÍDO automaticamente do seu 'Físico (Confirmado)'. Ajudo com mais algo?", chips: ["Dúvida sobre Boletos", "Ver Saldo", "Encerrar"] },
        erro: { reply: "Se você lançar a despesa com erro, o processo é simples: peça ao escritório para recusar a operação, assim você pode enviar novamente com os dados corretos." }
      },
      boleto: {
        1: { reply: "O processo de boletos tem 3 etapas. O primeiro passo é a **Conferência**. Ao receber um boleto, vá na aba 'Novos' e confirme que ele chegou à loja. Você já fez essa conferência?", chips: ["Já conferi", "O que é conferir?"] },
        2: { reply: "Excelente. O segundo passo é o **Registro de Pagamento**. Quando você efetivamente tirar o dinheiro do caixa para pagar, clique em 'Informar Pagamento Efetuado' e digite o valor exato. Conseguiu fazer isso?", chips: ["Sim, informei", "Como informo o pagamento?"] },
        3: { reply: "Pronto! O boleto passa para 'Análise de Pagamento'. O terceiro passo é com o escritório: eles vão avaliar e **Confirmar a Baixa**. Entendido?", chips: ["Entendido", "Já desconta do saldo?"] },
        4: { reply: "Somente após o escritório confirmar a baixa é que o status muda para 'Pago' e o valor é DESCONTADO automaticamente do seu 'Físico (Confirmado)'. Mais alguma dúvida?", chips: ["Voltar ao início", "Encerrar"] },
        erro: { reply: "Se notar algum erro no boleto (valor divergente, boleto de outra loja), use o botão de relatar erro durante a conferência para devolvê-lo ao escritório." }
      }
    };

    // PROGRESSÃO DE FLUXO ATIVO
    if (session.intent && flows[session.intent]) {
      if (isErrorQuery) {
        return responder(res, sessionId, session, flows[session.intent].erro.reply, flows[session.intent].erro.chips);
      }
      if (isContinuation) {
        const maxSteps = Object.keys(flows[session.intent]).filter(k => k !== 'erro').length;
        if (session.step < maxSteps) {
          session.step += 1;
          const currentFlow = flows[session.intent][session.step];
          return responder(res, sessionId, session, currentFlow.reply, currentFlow.chips);
        } else {
          session.intent = null;
          session.step = 0;
          return responder(res, sessionId, session, "Perfeito! Se precisar de ajuda com outra funcionalidade do Smart Farma, é só perguntar.", ["Sangria", "Despesa", "Boletos", "Saldo"]);
        }
      }
    }

    // 6. INTELIGÊNCIA LOCAL BASEADA EM REGEX (FAQ e Dúvidas Diretas)
    const faqs = [
      {
        match: /\b(como fazer|passo a passo|lancar|enviar|registrar|como faco|cadastrar)\b.*\bsangria\b/,
        action: () => { session.intent = "sangria"; session.step = 1; session.lastTopic = "sangria"; return flows.sangria[1]; }
      },
      {
        match: /\b(como fazer|passo a passo|lancar|enviar|registrar|como faco|cadastrar)\b.*\bdespesa\b/,
        action: () => { session.intent = "despesa"; session.step = 1; session.lastTopic = "despesa"; return flows.despesa[1]; }
      },
      {
        match: /\b(como pagar|passo a passo|baixar|como faco com|como funciona)\b.*\bboleto\b/,
        action: () => { session.intent = "boleto"; session.step = 1; session.lastTopic = "boleto"; return flows.boleto[1]; }
      },
      {
        match: /\b(boleto pendente|aceitar.*boleto.*pago|boleto.*ja desconta)\b/,
        action: () => ({ reply: "Não. Quando você aceita um boleto pendente (Conferência), o sistema apenas confirma que ele foi recebido na loja. Ele só será considerado pago e descontará do seu saldo após você 'Informar Pagamento' e o escritório 'Confirmar a Baixa'.", chips: ["Como informo pagamento?", "Entendi"] })
      },
      {
        match: /\b(diferenca|qual a diferenca)\b.*\b(sangria|despesa)\b/,
        action: () => ({ reply: "A diferença principal é o impacto no seu caixa:\n\n- **Sangria**: É o dinheiro enviado ao escritório. Quando aprovada, SOMA no seu saldo 'Físico (Confirmado)'.\n- **Despesa**: É o dinheiro gasto pela loja. Quando aprovada, SUBTRAI do seu saldo.", chips: ["Como lançar Sangria", "Como lançar Despesa"] })
      },
      {
        match: /\b(o que.*analise|significa.*analise|em analise)\b/,
        action: () => ({ reply: "O status 'Em Análise' significa que você lançou a operação no sistema, mas ela ainda aguarda a aprovação do escritório. Enquanto estiver 'Em Análise', o seu saldo Físico (Confirmado) NÃO sofre alterações.", chips: ["E quando aprova?", "Entendi"] })
      },
      {
        match: /\b(fisico confirmado|como funciona.*saldo|o que e.*saldo)\b/,
        action: () => ({ reply: "O 'Físico (Confirmado)' representa o dinheiro real que deve estar na sua gaveta. Ele é atualizado em tempo real na sua tela quando:\n- Sangrias são aprovadas (aumenta o saldo).\n- Despesas ou Boletos são aprovados/baixados (diminui o saldo).", chips: ["O que é Sangria?", "O que é Despesa?"] })
      },
      {
        match: /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem|menu|inicio)\b/,
        action: () => { session.intent = null; session.step = 0; return { reply: "Olá! Sou o Assistente Smart Farma. Estou aqui para te ajudar com as rotinas do sistema. O que você precisa fazer agora?", chips: ["Fazer Sangria", "Lançar Despesa", "Pagar Boleto", "Entender o Saldo"] }; }
      }
    ];

    for (const faq of faqs) {
      if (faq.match.test(msgLimpa)) {
        const result = faq.action();
        return responder(res, sessionId, session, result.reply, result.chips);
      }
    }

    // 7. PROTEÇÃO ANTI-ALUCINAÇÃO DIRETA
    if (!session.intent && isContinuation) {
      return responder(res, sessionId, session, "Estou pronto para ajudar! Sobre qual funcionalidade do Smart Farma você quer falar?", ["Sangria", "Despesa", "Boletos", "Saldo"]);
    }

    // 8. FILTRO FORA DE ESCOPO (Guardrail Robusto)
    const foraDeEscopo = /\b(receita federal|politica|esporte|futebol|clima|receita de bolo|piada|codigo|python|html|javascript|farmacia popular|vender|cliente|imposto)\b/.test(msgLimpa);
    if (foraDeEscopo) {
      return responder(res, sessionId, session, "Desculpe, meu conhecimento é estritamente focado nas funcionalidades internas do sistema Smart Farma (caixa, operações e boletos).", ["Ver opções do sistema"]);
    }

    // 9. FALLBACK INTELIGENTE COM IA (Llama-3.1 via Groq)
    let contextHint = session.lastTopic ? `[O usuário estava falando recentemente sobre '${session.lastTopic}']. ` : "";
    if (session.intent) {
      contextHint = `[O usuário está no fluxo de '${session.intent.toUpperCase()}', etapa ${session.step}]. `;
    }

    const systemPrompt = `Você é o Assistente especialista do sistema interno Smart Farma.
DIRETRIZES CRÍTICAS:
1. NUNCA diga que você executou, aprovou, verificou ou alterou algo no sistema. Você APENAS orienta e explica.
2. NUNCA invente funcionalidades, telas ou botões que não existam nas regras abaixo.
3. Seja gentil, claro, corporativo e extremamente conciso. Use parágrafos curtos.

REGRAS DE NEGÓCIO DO SISTEMA (VERDADE ABSOLUTA):
- SANGRIA: Dinheiro enviado ao escritório. Loja lança -> Escritório aprova -> SOMA no Físico Confirmado da loja.
- DESPESA: Gasto da loja. Loja lança -> Escritório aprova -> SUBTRAI do Físico Confirmado.
- BOLETOS (3 Etapas rigorosas): 
  1. Conferência (Loja aceita/confirma recebimento). 
  2. Registro (Loja informa pagamento). 
  3. Escritório confirma a baixa (Só aqui o valor é descontado do saldo).
- STATUS 'EM ANÁLISE': Operações aguardando o escritório. Não afetam o saldo ainda.
${contextHint}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1, // Temperatura baixa para respostas cirúrgicas e factuais
        max_tokens: 300
      })
    });

    if (!response.ok) {
        return res.status(502).json({ reply: "Estou com instabilidade temporária na minha conexão. Por favor, tente perguntar novamente em instantes.", chips: ["Tentar novamente"] });
    }

    const data = await response.json();
    let reply = data?.choices?.[0]?.message?.content?.trim();

    // Se a IA não souber o que dizer, oferecemos o menu de navegação
    if (!reply || reply.length < 5) {
        reply = "Não consegui compreender exatamente sua dúvida. Você quer ajuda com algum destes processos abaixo?";
        return responder(res, sessionId, session, reply, ["Sangria", "Despesa", "Boletos", "Saldo"]);
    }

    return responder(res, sessionId, session, reply);

  } catch (e) {
    console.error("Erro na API Chat:", e);
    return res.status(500).json({ reply: "Ocorreu uma falha interna nos meus sistemas. Tente novamente mais tarde.", chips: ["Recarregar Chat"] });
  }
}

// ATUALIZADOR DE ESTADO E FORMATADOR DE RESPOSTA
function responder(res, sessionId, session, replyText, chipsArray = null) {
  sessionCache.set(sessionId, session);
  const responseData = { reply: replyText, sessionId: sessionId };
  if (chipsArray && Array.isArray(chipsArray)) {
      responseData.chips = chipsArray;
  }
  return res.status(200).json(responseData);
}