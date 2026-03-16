// api/chat.js

// 1. MEMÓRIA DE SESSÃO AVANÇADA E ISOLADA
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
      return res.status(400).json({ reply: "Sua mensagem é muito longa. Por favor, seja mais direto para eu poder te ajudar com precisão." });
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

    // 4. INTERCEPTADORES DE ALTA PRIORIDADE (GUARDRAILS)
    
    // A. Interceptador Meta/Identidade (Evita alucinação de data de atualização e LLM)
    const metaRegex = /\b(atualiza[çc][ãa]o|treinamento|quem te criou|vers[ãa]o|chatgpt|gpt|gemini|llm|ia|inteligencia artificial|modelo)\b/i;
    if (metaRegex.test(msgLimpa) && !msgLimpa.includes("sistema") && !msgLimpa.includes("tela")) {
        return responder(res, sessionId, session, "Não possuo uma data pública de atualização ou detalhes técnicos. Fui configurado de forma estrita apenas para ajudar com as regras e o uso interno do sistema Smart Farma.", ["Voltar ao Menu"]);
    }

    // B. Interceptador de Fora de Escopo
    const foraDeEscopoRegex = /\b(receita federal|politica|esporte|futebol|clima|receita de bolo|piada|codigo|python|html|javascript|farmacia popular|vender|cliente|imposto)\b/;
    if (foraDeEscopoRegex.test(msgLimpa)) {
      return responder(res, sessionId, session, "Desculpe, só tenho permissão para orientar sobre o uso do sistema Smart Farma (caixa, operações, saldo e boletos).", ["Ver opções do sistema"]);
    }

    // C. Interceptador de Contexto Local ("Onde fica?")
    const locationRegex = /\b(onde fica|onde [ée]|como [eu ]*acho|onde acho|aonde vou|onde clico|qual tela)\b/i;
    if (locationRegex.test(msgLimpa)) {
        if (session.lastTopic === 'sangria' || session.lastTopic === 'despesa' || msgLimpa.includes("operacao") || msgLimpa.includes("sangria") || msgLimpa.includes("despesa")) {
            return responder(res, sessionId, session, "A opção 'Registrar Operação' fica localizada no menu principal da área da loja. Lá você escolhe o tipo (Sangria ou Despesa).", ["Entendi"]);
        } else if (session.lastTopic === 'boleto' || msgLimpa.includes("boleto")) {
            return responder(res, sessionId, session, "A 'Central de Boletos' fica no menu principal do sistema. Lá você tem abas separadas para Novos Boletos e Boletos em Análise.", ["Entendi"]);
        } else {
            return responder(res, sessionId, session, "Depende do que você quer fazer. A 'Central de Boletos' e o 'Registrar Operação' ficam no menu principal da loja. O que você está tentando lançar?", ["Fazer Sangria", "Pagar Boleto"]);
        }
    }

    // 5. DETECÇÃO DE CONTEXTO E CONTINUIDADE
    const isContinuation = /\b(e agr|agr|e agora|agora|depois|pr[oó]ximo( passo)?|pronto|j[aá] fiz|coloquei( o valor)?|adicionei|enviei|e a[ií]|fiz( isso)?|sim|ok|achei|encontrei|continue|certo|entendi|beleza)\b/i.test(msgLimpa) && msgLimpa.split(' ').length <= 6;
    const isErrorQuery = /\b(errar|errei|erro|corrigir|se der erro|consertar|fiz errado|esqueci)\b/.test(msgLimpa);

    // 6. BANCO DE CONHECIMENTO RIGOROSO (FAQs Locais)
    const faqs = [
      { // Entrando no fluxo Sangria
        match: /\b(como fazer|passo a passo|lancar|enviar|registrar|como faco|cadastrar)\b.*\bsangria\b/,
        action: () => { session.intent = "sangria"; session.step = 1; session.lastTopic = "sangria"; return { reply: "Para registrar uma sangria:\n\n1. Acesse o menu 'Registrar Operação'.\n2. Escolha o tipo 'Sangria'.\n\nVocê conseguiu encontrar essa tela?", chips: ["Sim, encontrei", "Onde fica?"] }; }
      },
      { // Entrando no fluxo Despesa
        match: /\b(como fazer|passo a passo|lancar|enviar|registrar|como faco|cadastrar)\b.*\bdespesa\b/,
        action: () => { session.intent = "despesa"; session.step = 1; session.lastTopic = "despesa"; return { reply: "Para registrar uma despesa:\n\n1. Acesse o menu 'Registrar Operação'.\n2. Escolha 'Retirada de Despesa'.\n\nConseguiu achar?", chips: ["Sim, achei", "Onde fica?"] }; }
      },
      { // Entrando no fluxo Boleto
        match: /\b(como pagar|passo a passo|baixar|como faco com|como funciona)\b.*\bboleto\b/,
        action: () => { session.intent = "boleto"; session.step = 1; session.lastTopic = "boleto"; return { reply: "O processo de boletos tem 3 etapas. O primeiro passo é a **Conferência**. Ao receber um boleto, vá na 'Central de Boletos', aba 'Novos', e confirme que ele chegou à loja. Você já fez essa conferência inicial?", chips: ["Já conferi", "Como conferir?"] }; }
      },
      { // Dúvidas Críticas de Boletos
        match: /\b(se eu aceitar.*pago|aceitei.*ja descontou|boleto pendente significa pago|boleto pendente ja.*saldo)\b/,
        action: () => { session.lastTopic = "boleto"; return { reply: "Não! Aceitar um boleto pendente apenas confirma que ele chegou na loja (Conferência). Ele **não** está pago e **não** descontou do seu saldo ainda.\n\nPara pagar, você precisa 'Informar Pagamento Efetuado' e aguardar o escritório aprovar a baixa.", chips: ["Onde informo o pagamento?", "Entendi"] }; }
      },
      { // Onde informar pagamento do boleto
        match: /\b(onde informo o pagamento|como informar.*boleto|como pagar.*boleto)\b/,
        action: () => { session.lastTopic = "boleto"; return { reply: "Para informar que você pagou:\n\n1. Vá na 'Central de Boletos'.\n2. Clique em 'Informar Pagamento Efetuado' no boleto desejado.\n3. Digite o valor exato que você retirou do caixa.", chips: ["O que acontece depois?", "Entendi"] }; }
      },
      { // Dúvidas sobre o que fazer com boleto pendente
        match: /\b(tenho boleto pendente.*faco|o que faco.*boleto pendente)\b/,
        action: () => { session.lastTopic = "boleto"; return { reply: "Se você tem um boleto pendente ('Novos'), o primeiro passo é conferir se os dados estão corretos e clicar para aceitar/confirmar o recebimento. Depois disso, quando você for pagar com o dinheiro do caixa, você deve 'Informar Pagamento Efetuado'.", chips: ["Como informar pagamento?", "E se o boleto estiver errado?"] }; }
      },
      { // Sangria vs Despesa
        match: /\b(diferenca|qual a diferenca)\b.*\b(sangria|despesa)\b/,
        action: () => { return { reply: "A diferença principal é a consequência no seu caixa:\n\n• **Sangria**: É dinheiro enviado ao escritório. Quando o escritório aprova, esse valor **SOMA** no seu saldo Físico.\n• **Despesa**: É dinheiro gasto na loja. Quando aprovada, **SUBTRAI** do seu saldo Físico.", chips: ["Como lançar Sangria", "Como lançar Despesa"] }; }
      },
      { // Definição de Em Análise
        match: /\b(o que.*analise|significa.*analise|em analise)\b/,
        action: () => { return { reply: "O status 'Em Análise' significa que a operação foi enviada para o sistema, mas o escritório ainda precisa revisar e aprovar. **Atenção:** Operações em análise não alteram o seu saldo físico até serem aprovadas.", chips: ["Quando o saldo muda?", "Entendi"] }; }
      },
      { // Definição de Pendente
        match: /\b(o que.*pendente|significa.*pendente)\b/,
        action: () => { return { reply: "O status 'Pendente' geralmente aparece para Novos Boletos que o escritório enviou para a loja e que você ainda não conferiu ou aceitou.", chips: ["Fluxo de Boletos"] }; }
      },
      { // Consequências e Saldo Físico
        match: /\b(fisico confirmado|como funciona.*saldo|o que e.*saldo|quando o saldo muda|quando.*atualizado|o que acontece quando.*aprovad[ao])\b/,
        action: () => { return { reply: "O saldo 'Físico (Confirmado)' representa o dinheiro que deve estar na gaveta. Ele atualiza em tempo real exclusivamente quando o escritório toma uma ação:\n\n• **Aprova Sangria:** O saldo aumenta.\n• **Aprova Despesa:** O saldo diminui.\n• **Confirma Baixa de Boleto:** O saldo diminui.", chips: ["Entendi", "Dúvida sobre Boletos"] }; }
      },
      { // Saudações e Menu inicial
        match: /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem|menu|inicio)\b/,
        action: () => { session.intent = null; session.step = 0; session.lastTopic = null; return { reply: "Olá! Sou o Assistente Smart Farma. Estou aqui exclusivamente para orientar sobre o sistema. Como posso ajudar hoje?", chips: ["Fazer Sangria", "Lançar Despesa", "Fluxo de Boletos", "Entender o Saldo"] }; }
      }
    ];

    for (const faq of faqs) {
      if (faq.match.test(msgLimpa)) {
        const result = faq.action();
        return responder(res, sessionId, session, result.reply, result.chips);
      }
    }

    // 7. PROGRESSÃO DE FLUXO ATIVO (State Machine)
    const flows = {
      sangria: {
        2: { reply: "Ótimo! Na tela de Sangria, informe o valor exato que está enviando, escreva a observação (motivo) e, se precisar, ajuste a 'Data da operação'. Já preencheu tudo?", chips: ["Já preenchi", "Errei o valor, e agora?"] },
        3: { reply: "Perfeito. Basta clicar em 'Enviar Registro'. A sangria ficará 'Em Análise', aguardando o escritório aprovar.\n\nFicou claro?", chips: ["Sim, entendi", "O que significa Em Análise?"] },
        4: { reply: "Assim que o escritório aprovar, a sangria SOMA automaticamente no seu 'Físico (Confirmado)'.\n\nPosso ajudar com mais alguma coisa?", chips: ["Ver Menu Principal", "Encerrar"] },
        erro: { reply: "Se você errar o valor na sangria, avise o escritório. Eles podem modificar o valor na hora de aprovar ou recusar a operação para você lançar de novo." }
      },
      despesa: {
        2: { reply: "Legal. Informe o valor gasto, escreva o detalhe da despesa na observação e ajuste a data se ocorreu em outro dia. Tudo certo até aqui?", chips: ["Tudo certo", "Errei, o que faço?"] },
        3: { reply: "Agora é só clicar em 'Enviar Registro'. A despesa ficará 'Em Análise' pelo escritório. Entendido?", chips: ["Entendi", "Quando desconta do saldo?"] },
        4: { reply: "Quando o escritório aprovar, o valor será SUBTRAÍDO automaticamente do seu 'Físico (Confirmado)'. Ajudo com mais algo?", chips: ["Ver Menu Principal", "Encerrar"] },
        erro: { reply: "Se errar ao lançar a despesa, peça ao escritório para recusar a operação, assim você poderá enviá-la novamente com os dados corretos." }
      },
      boleto: {
        2: { reply: "O segundo passo é o **Registro de Pagamento**. Quando você tirar o dinheiro da gaveta para pagar o boleto, clique em 'Informar Pagamento Efetuado' e digite o valor exato. Conseguiu fazer isso?", chips: ["Sim, informei", "E agora?"] },
        3: { reply: "Pronto! O boleto passa para 'Análise de Pagamento'. O terceiro e último passo é com o escritório: eles vão avaliar e **Confirmar a Baixa** no sistema. Entendido?", chips: ["Entendido", "Já descontou do saldo?"] },
        4: { reply: "Lembre-se: Somente APÓS o escritório confirmar a baixa é que o status muda para 'Pago' e o valor é DESCONTADO automaticamente do seu caixa. Mais alguma dúvida?", chips: ["Ver Menu Principal", "Encerrar"] },
        erro: { reply: "Se notar algum erro no boleto (valor divergente, por exemplo), use o botão de relatar erro na tela de conferência para devolvê-lo ao escritório." }
      }
    };

    if (session.intent && flows[session.intent]) {
      if (isErrorQuery) {
        return responder(res, sessionId, session, flows[session.intent].erro.reply, flows[session.intent].erro.chips);
      }
      if (isContinuation) {
        session.step += 1;
        const currentFlow = flows[session.intent][session.step];
        if (currentFlow) {
            return responder(res, sessionId, session, currentFlow.reply, currentFlow.chips);
        } else {
            session.intent = null;
            session.step = 0;
            return responder(res, sessionId, session, "Fluxo concluído! O que mais você deseja saber sobre o sistema?", ["Sangria", "Despesas", "Boletos", "Saldo do Caixa"]);
        }
      }
    }

    // Se a mensagem for muito curta e sem contexto claro de fluxo, pedir direcionamento.
    if (!session.intent && isContinuation) {
      return responder(res, sessionId, session, "Estou pronto para ajudar! Escolha uma das opções abaixo para começarmos:", ["Sangria", "Despesas", "Boletos", "Saldo do Caixa"]);
    }

    // 8. FALLBACK INTELIGENTE COM LLM (Groq)
    let contextHint = session.lastTopic ? `[O usuário estava conversando sobre '${session.lastTopic}']. ` : "";
    if (session.intent) {
      contextHint += `[O usuário está no meio de um passo a passo sobre '${session.intent}', etapa atual: ${session.step}]. `;
    }

    const systemPrompt = `Você é o Assistente especialista do sistema interno Smart Farma.
DIRETRIZES ABSOLUTAS:
1. NUNCA invente funcionalidades, botões, telas ou menus que não existam.
2. NUNCA afirme que você executou, aprovou, analisou ou verificou ações no sistema. Você é apenas um guia textual.
3. BOLETOS (3 ETAPAS OBRIGATÓRIAS): Conferência (aceite na loja) -> Registro do Pagamento (informar valor) -> Confirmação do Escritório (baixa). Aceitar boleto não paga e não desconta saldo.
4. EXPLIQUE AS CONSEQUÊNCIAS: Sempre deixe claro que 'Sangria' SOMA no saldo após aprovação, e 'Despesa/Boleto' SUBTRAI do saldo após aprovação. Operações 'Em Análise' não afetam o saldo.
5. RESPOSTA CLARA: Responda em parágrafos curtos. Use bullet points se precisar listar algo.
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
        temperature: 0.1, 
        max_tokens: 250
      })
    });

    if (!response.ok) {
        return res.status(502).json({ reply: "Estou com instabilidade temporária na minha conexão. Por favor, tente perguntar novamente em instantes." });
    }

    const data = await response.json();
    let reply = data?.choices?.[0]?.message?.content?.trim();

    // Menu de Fallback Estruturado se o LLM falhar
    if (!reply || reply.length < 5) {
        reply = "Não compreendi totalmente sua pergunta.\n\nPosso te ajudar com as seguintes áreas do sistema:\n• Como lançar Sangria\n• Como lançar Despesa\n• Fluxo de Boletos\n• Saldo do caixa\n\nSobre qual destes tópicos você quer falar?";
        return responder(res, sessionId, session, reply, ["Sangria", "Despesas", "Boletos", "Saldo"]);
    }

    return responder(res, sessionId, session, reply);

  } catch (e) {
    console.error("Erro na API Chat:", e);
    return res.status(500).json({ reply: "Ocorreu uma falha interna nos meus sistemas. Tente novamente em instantes.", chips: ["Recarregar"] });
  }
}

function responder(res, sessionId, session, replyText, chipsArray = null) {
  sessionCache.set(sessionId, session);
  const responseData = { reply: replyText, sessionId: sessionId };
  if (chipsArray && Array.isArray(chipsArray)) {
      responseData.chips = chipsArray;
  }
  return res.status(200).json(responseData);
}