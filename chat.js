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
      return res.status(400).json({ reply: "Sua mensagem é muito longa. Por favor, seja mais direto para eu poder te ajudar com precisão sobre o sistema da farmácia." });
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

    // =========================================================================
    // 4. GUARDRAILS ANTI-ALUCINAÇÃO E INTERCEPTADORES DE ESCOPO
    // =========================================================================
    
    // A. Identidade do Sistema ("O que é Smart Farma?")
    if (/\b(o que [eé]( o)? smart farma|para que serve( o sistema)?|o que o sistema faz|o que vc faz)\b/i.test(msgLimpa)) {
        return responder(res, sessionId, session, "Smart Farma é o nome da farmácia onde este sistema é utilizado.\n\nO sistema Smart Farma é uma ferramenta interna usada pelas lojas para registrar operações do caixa (sangrias, despesas, boletos) e acompanhar o saldo físico. Essas operações são enviadas para análise do escritório.", ["Como lançar Sangria", "Como lançar Despesa", "Fluxo de Boletos"]);
    }

    // B. Interceptador de Infraestrutura, Histórico e Criação (Bloqueio Total)
    if (/\b(atualiza[çc][ãa]o|vers[ãa]o|quem te criou|quem fez|quem desenvolveu|qual empresa.*criou|onde.*hospedado|em que servidor|onde (voce|vc) roda|knowledge cutoff|data limite|hist[óo]rico|dono|criador|programador)\b/i.test(msgLimpa)) {
        return responder(res, sessionId, session, "Não possuo uma data pública de atualização, nem informações técnicas de infraestrutura, desenvolvimento ou histórico da empresa. Fui configurado apenas para ajudar com o uso do sistema interno da farmácia Smart Farma.", ["Ver funções do sistema"]);
    }

    // C. Interceptador de Alucinações Corporativas (Veterinária, Agricultura, Outros Setores)
    if (/\b(veterin[áa]ria|agr[íi]cola|agricultura|agro|produto comercial|vender sistema)\b/i.test(msgLimpa)) {
        return responder(res, sessionId, session, "Isso está incorreto. Este sistema é de uso exclusivamente interno da farmácia Smart Farma e focado na gestão do caixa da loja.", ["Entendi"]);
    }

    // D. Interceptador Fora de Escopo (Estoque, Vendas, Contabilidade, ERP Genérico)
    if (/\b(estoque|venda|nota fiscal|nf|contabilidade|erp|cliente|receita federal|produto|medicamento|bula|receita m[ée]dica|imposto|fornecedor externo)\b/i.test(msgLimpa)) {
      return responder(res, sessionId, session, "Não lido com estoque, vendas, emissão de notas fiscais ou contabilidade geral. O sistema interno foca apenas no controle financeiro do caixa da loja. Posso ajudar apenas com sangrias, despesas, boletos e saldo do caixa.", ["Fazer Sangria", "Pagar Boleto"]);
    }

    // =========================================================================
    // 5. INTERPRETAÇÃO DE CONTEXTO ("Onde fica?")
    // =========================================================================

    const dificuldadeRegex = /\b(n[aã]o achei|nao achei|n[aã]o encontrei|nao encontrei|cad[eê]|onde fica|onde [ée]|como [eu ]*acho|onde acho|aonde vou|onde clico|qual tela|n[aã]o sei|nao sei)\b/i;
    if (dificuldadeRegex.test(msgLimpa)) {
        const isSangria = (session.intent === 'sangria' || session.lastTopic === 'sangria' || msgLimpa.includes("sangria"));
        session.intent = "ajuda_guiada";
        if (isSangria) {
            return responder(res, sessionId, session, "Sem problema. Me diz uma coisa:\nVocê está na área do vendedor ou do escritório?\n\nNa sua tela aparece algum desses?\n- 'Registrar Operação'\n- 'Sangria'\n- ou algo parecido?");
        } else {
            return responder(res, sessionId, session, "Sem problema. Me diz uma coisa:\nVocê está como vendedor ou escritório?\n\nQuais botões você está vendo aí?");
        }
    }

    const isContinuation = /\b(e agr|agr|e agora|depois|pr[oó]ximo( passo)?|pronto|j[aá] fiz|coloquei( o valor)?|adicionei|enviei|e a[ií]|fiz( isso)?|sim|ok|achei|encontrei|continue|certo|entendi|beleza)\b/i.test(msgLimpa) && msgLimpa.split(' ').length <= 6;
    const isErrorQuery = /\b(errar|errei|erro|corrigir|se der erro|consertar|fiz errado|esqueci)\b/.test(msgLimpa);

    // =========================================================================
    // 6. BANCO DE CONHECIMENTO RIGOROSO (FAQs Locais do Sistema)
    // =========================================================================
    const faqs = [
      { // Sangria Inicial
        match: /\b(como fazer|passo a passo|lancar|enviar|registrar|como faco|cadastrar)\b.*\bsangria\b/,
        action: () => { session.intent = "sangria"; session.step = 1; session.lastTopic = "sangria"; return { reply: "Para fazer uma sangria:\n- Clique em 'Registrar Operação'\n- Escolha 'Sangria'\n\nVocê encontrou esse botão?", chips: ["Sim", "Não encontrei"] }; }
      },
      { // Despesa Inicial
        match: /\b(como fazer|passo a passo|lancar|enviar|registrar|como faco|cadastrar)\b.*\bdespesa\b/,
        action: () => { session.intent = "despesa"; session.step = 1; session.lastTopic = "despesa"; return { reply: "Para registrar uma despesa:\n\n1. Acesse o menu 'Registrar Operação'.\n2. Escolha 'Retirada de Despesa'.\n\nConseguiu achar?", chips: ["Sim, achei", "Onde fica?"] }; }
      },
      { // Boleto Inicial e Regra de 3 Etapas
        match: /\b(como pagar|passo a passo|baixar|como faco com|como funciona)\b.*\bboleto\b/,
        action: () => { session.intent = "boleto"; session.step = 1; session.lastTopic = "boleto"; return { reply: "O processo de boletos no sistema possui 3 etapas obrigatórias:\n\n**1. Conferência:** Ao receber um boleto na 'Central de Boletos' (aba Novos), você confirma que ele chegou à loja.\n**2. Registro de Pagamento:** Você informa o valor que retirou do caixa para pagar.\n**3. Confirmação do Escritório:** O escritório aprova a baixa.\n\nVocê já fez a etapa 1 (Conferência)?", chips: ["Já conferi", "Como conferir?"] }; }
      },
      { // Dúvidas Críticas de Boletos (Aceitar vs Pagar)
        match: /\b(se eu aceitar.*pago|aceitei.*ja descontou|boleto pendente significa pago|boleto pendente ja.*saldo|conferir.*paga|o que e.*pendente)\b/,
        action: () => { session.lastTopic = "boleto"; return { reply: "Atenção: Conferir ou aceitar um boleto 'Pendente' apenas avisa o sistema que o documento chegou na loja. Ele **não** está pago e **não** descontou do seu saldo Físico.\n\nPara prosseguir com o pagamento, você precisa clicar em 'Informar Pagamento Efetuado'.", chips: ["Onde informo o pagamento?", "Entendi"] }; }
      },
      { // Onde informar pagamento do boleto
        match: /\b(onde informo o pagamento|como informar.*boleto|como pagar.*boleto)\b/,
        action: () => { session.lastTopic = "boleto"; return { reply: "Para registrar que você usou o dinheiro do caixa para pagar o boleto:\n\n1. Vá na 'Central de Boletos'.\n2. Clique no botão 'Informar Pagamento Efetuado' no boleto desejado.\n3. Digite o valor exato que foi pago.", chips: ["O que acontece depois?", "Entendi"] }; }
      },
      { // Sangria vs Despesa
        match: /\b(diferenca|qual a diferenca)\b.*\b(sangria|despesa)\b/,
        action: () => { return { reply: "A diferença está na finalidade e no impacto no seu saldo:\n\n• **Sangria**: É dinheiro recolhido/enviado da loja ao escritório. Quando o escritório aprova, esse valor **SOMA** no seu 'Físico Confirmado'.\n• **Despesa**: É dinheiro gasto pela própria loja (ex: material de limpeza). Quando aprovada, **SUBTRAI** do seu saldo 'Físico Confirmado'.", chips: ["Como lançar Sangria", "Como lançar Despesa"] }; }
      },
      { // Definição de Em Análise
        match: /\b(o que.*analise|significa.*analise|em analise|analise de pagamento)\b/,
        action: () => { return { reply: "O status 'Em Análise' significa que a sua operação (Sangria, Despesa ou o Registro de Pagamento de um Boleto) foi enviada para o sistema e está aguardando o escritório revisar e aprovar.\n\n**Atenção:** Nenhuma operação em análise altera o seu saldo físico da gaveta até que o escritório confirme a baixa.", chips: ["Quando o saldo muda?", "Entendi"] }; }
      },
      { // Regra de Saldo Físico
        match: /\b(fisico confirmado|como funciona.*saldo|o que e.*saldo|quando o saldo muda|quando.*atualizado|o que acontece.*aprovada?|o que acontece.*confirmado)\b/,
        action: () => { return { reply: "O saldo 'Físico (Confirmado)' representa o dinheiro exato que deve estar fisicamente na sua gaveta de caixa. Ele atualiza APENAS nas seguintes condições:\n\n• **Sangria Aprovada pelo escritório:** O saldo aumenta.\n• **Despesa Aprovada pelo escritório:** O saldo diminui.\n• **Boleto Confirmado pelo Escritório (Etapa 3):** O saldo diminui.", chips: ["Entendi", "Dúvida sobre Boletos"] }; }
      },
      { // Menu inicial
        match: /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem|menu|inicio|ajuda)\b/,
        action: () => { session.intent = null; session.step = 0; session.lastTopic = null; return { reply: "Olá! Sou o assistente exclusivo do sistema interno da farmácia Smart Farma. Estou aqui para te orientar sobre as rotinas de caixa da loja. O que você deseja fazer?", chips: ["Sangrias", "Despesas", "Boletos", "Saldo do Caixa"] }; }
      }
    ];

    for (const faq of faqs) {
      if (faq.match.test(msgLimpa)) {
        const result = faq.action();
        return responder(res, sessionId, session, result.reply, result.chips);
      }
    }

    // =========================================================================
    // 7. PROGRESSÃO DOS FLUXOS DE OPERAÇÃO
    // =========================================================================
    const flows = {
      sangria: {
        2: { reply: "Na tela de Sangria, informe o valor exato, escreva a observação (motivo) e ajuste a 'Data da operação' se necessário. Você já preencheu os campos?", chips: ["Já preenchi", "Errei o valor, e agora?"] },
        3: { reply: "Agora clique em 'Enviar Registro'. A sangria ficará com o status 'Em Análise', aguardando a aprovação do escritório.\n\nFicou claro?", chips: ["Sim, entendi", "O que significa Em Análise?"] },
        4: { reply: "Lembre-se: Assim que o escritório aprovar, a sangria SOMARÁ automaticamente no seu saldo 'Físico (Confirmado)'. Ajudo com mais alguma coisa?", chips: ["Voltar ao início", "Encerrar"] },
        erro: { reply: "Se você errar o valor na sangria, não se preocupe. Avise o escritório imediatamente; eles podem ajustar o valor durante a aprovação ou recusar a operação para que você possa enviá-la novamente do jeito certo." }
      },
      despesa: {
        2: { reply: "Informe o valor gasto, detalhe o que foi comprado na observação e ajuste a data caso a despesa tenha ocorrido em outro dia. Tudo certo até aqui?", chips: ["Tudo certo", "Errei, o que faço?"] },
        3: { reply: "Agora, clique em 'Enviar Registro'. Sua despesa ficará 'Em Análise' pelo escritório. Entendido?", chips: ["Entendi", "Quando desconta do saldo?"] },
        4: { reply: "Atenção: Quando o escritório aprovar, o valor será SUBTRAÍDO do seu saldo 'Físico (Confirmado)'. Mais alguma dúvida?", chips: ["Voltar ao início", "Encerrar"] },
        erro: { reply: "Se errar os dados ao lançar uma despesa, peça para o responsável no escritório recusar a operação. Assim, ela será cancelada e você poderá enviar uma nova com os dados corretos." }
      },
      boleto: {
        2: { reply: "A Etapa 2 é o **Registro de Pagamento**. Quando você retirar o dinheiro do caixa para efetuar o pagamento do boleto, clique no botão 'Informar Pagamento Efetuado' e digite o valor exato pago. Conseguiu fazer isso?", chips: ["Sim, informei", "E agora?"] },
        3: { reply: "Pronto! O boleto agora passa para o status de 'Análise de Pagamento'. A Etapa 3 e última é com o escritório: eles vão avaliar a operação e **Confirmar a Baixa** no sistema corporativo. Entendido?", chips: ["Entendido", "Já descontou do saldo?"] },
        4: { reply: "Reforçando a regra vital: Somente APÓS o escritório confirmar a baixa na Etapa 3 é que o boleto fica 'Pago' e o valor é DESCONTADO automaticamente do seu caixa. Posso ajudar com mais algo?", chips: ["Voltar ao início", "Encerrar"] },
        erro: { reply: "Se você notar alguma inconsistência no boleto (como valor diferente ou se o boleto não for da sua loja), utilize o botão de relatar erro diretamente na tela de conferência. Isso devolverá o documento ao escritório para correção." }
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
            return responder(res, sessionId, session, "Fluxo concluído! O que mais você precisa verificar no sistema da farmácia?", ["Sangria", "Despesas", "Boletos", "Saldo do Caixa"]);
        }
      }
    }

    if (!session.intent && isContinuation) {
      return responder(res, sessionId, session, "Estou pronto para ajudar! Escolha uma das operações de caixa abaixo para começarmos:", ["Lançar Sangria", "Lançar Despesa", "Pagar Boletos", "Verificar Saldo"]);
    }

    // =========================================================================
    // 8. FALLBACK INTELIGENTE (LLM BLINDADO - SYSTEM PROMPT REFORÇADO)
    // =========================================================================
    let contextHint = session.lastTopic ? `[Contexto Atual: O usuário está perguntando sobre '${session.lastTopic}']. ` : "";
    if (session.intent === "ajuda_guiada") {
      contextHint += `[AJUDA GUIADA ATIVADA: O usuário estava perdido. Você acabou de perguntar se ele é vendedor ou escritório e quais botões vê. A mensagem dele agora é a resposta. PROIBIDO dizer 'Ótimo', 'Perfeito', etc., ou assumir que ele encontrou os botões se ele ainda estiver perdido. APENAS avance ou instrua APÓS ele confirmar onde está. Respeite as diferenças entre perfil vendedor e escritório.] `;
    } else if (session.intent) {
      contextHint += `[Progresso: O usuário está no fluxo de '${session.intent}', etapa ${session.step}]. `;
    }

    const systemPrompt = `Você é um assistente virtual ESTRITAMENTE focado e restrito ao SISTEMA INTERNO de caixa da farmácia "Smart Farma".

IDENTIDADE E REGRAS ABSOLUTAS (NUNCA VIOLE):
1. NATUREZA: "Smart Farma" é o nome da farmácia. Este sistema é APENAS uma ferramenta interna das lojas. NÃO é um produto comercial para outras farmácias.
2. ESCOPO PERMITIDO: Você SÓ pode falar sobre:
   - Sangrias: Retirada de dinheiro para o escritório. Soma no Saldo Físico após aprovada.
   - Despesas: Gastos da loja. Subtrai do Saldo Físico após aprovada.
   - Boletos: Tem 3 etapas (1. Conferência, 2. Registro de Pagamento, 3. Confirmação do Escritório). O saldo só desconta na etapa 3.
   - Saldo Físico Confirmado.
3. ESCOPO PROIBIDO: NUNCA responda sobre gestão de estoque, vendas, notas fiscais, ERP geral ou contabilidade. Se perguntarem, diga que o sistema foca apenas no controle do caixa.
4. ANTI-ALUCINAÇÃO: NUNCA invente informações sobre quem desenvolveu o sistema, histórico da empresa, ou data de atualização.
5. EXECUÇÃO: Você NÃO faz alterações no sistema, banco de dados ou executa tarefas. Você apenas ensina o usuário a usar as telas.

Como responder: Seja muito direto, técnico e foque exclusivamente no uso do sistema. Responda em português do Brasil.
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
        temperature: 0.0, // Zero criatividade, estritamente factual.
        max_tokens: 250
      })
    });

    if (!response.ok) {
        return res.status(502).json({ reply: "Estou enfrentando uma instabilidade temporária na minha conexão. Por favor, aguarde um momento e envie sua mensagem novamente." });
    }

    const data = await response.json();
    let reply = data?.choices?.[0]?.message?.content?.trim();

    // Validação estrita do LLM. Se a resposta for vazia, muito curta ou pedir desculpas genéricas.
    if (!reply || reply.length < 15 || reply.toLowerCase().includes("não tenho informações")) {
        reply = "Não localizei a resposta exata para isso no meu banco de dados do sistema do caixa. Posso te ajudar com passo a passo nas seguintes rotinas:\n\n• Lançar Sangrias\n• Lançar Despesas\n• Fluxo de Boletos\n• Controle do Saldo da Loja\n\nQual destas opções você prefere?";
        return responder(res, sessionId, session, reply, ["Sangrias", "Despesas", "Boletos", "Saldo"]);
    }

    return responder(res, sessionId, session, reply);

  } catch (e) {
    console.error("Erro na API Chat:", e);
    return res.status(500).json({ reply: "Ocorreu uma falha de conexão interna no servidor. Tente recarregar a página da loja e tentar novamente.", chips: ["Tentar de novo"] });
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