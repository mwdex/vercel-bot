// api/chat.js

// 1. MEMÓRIA CURTA (CACHE DE SESSÃO)
// Mantém o estado da conversa em memória nas instâncias ativas para continuidade de fluxo.
const sessionCache = new Map();

// Tempo máximo para considerar a memória válida (15 minutos)
const SESSION_TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    const { message, sessionId = 'default-user' } = req.body || {};
    
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem vazia ou inválida." });
    }

    const userMessage = message.trim();
    if (userMessage.length > 300) {
      return res.status(400).json({ error: "Sua mensagem é muito longa. Por favor, seja mais breve." });
    }

    // 2. NORMALIZAÇÃO (Sem acentos, pontuação mínima e minúsculo para facilitar roteamento)
    const msgLimpa = userMessage
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // 3. RECUPERAR MEMÓRIA (CONTEXTO)
    let session = sessionCache.get(sessionId);
    if (!session || (Date.now() - session.lastUpdated > SESSION_TTL)) {
      session = { intent: null, step: 0, lastUpdated: Date.now() };
    } else {
      session.lastUpdated = Date.now();
    }

    // 4. DETECÇÃO DE INTENÇÃO E CONTINUIDADE
    const isContinuation = /\b(e agora|depois|ja fiz|pronto|coloquei|adicionei|onde fica|onde vejo|proximo passo|proximo|e ai|fiz|sim|ok|achei|encontrei|continue)\b/.test(msgLimpa);
    const isErrorQuery = /\b(errar|errei|erro|corrigir|se der erro|consertar)\b/.test(msgLimpa);

    // FLUXOS GUIADOS LOCAIS
    const flows = {
      sangria: {
        1: "Para lançar uma Sangria, acesse 'Registrar Operação' no painel e selecione o tipo 'Sangria'. Conseguiu achar?",
        2: "Perfeito! Agora digite o Valor e coloque uma Observação. Note que você também pode mudar a 'Data da operação' se for um registro de outro dia. Já preencheu?",
        3: "Agora é só clicar em 'Enviar Registro'. A sangria ficará 'Em Análise'. Quando o escritório aprovar, ela SOMA no seu saldo 'Físico (Confirmado)' em tempo real! Posso ajudar com mais algo?",
        erro: "Se você errar o valor ou algo, o escritório pode modificar a operação ou recusar para que você envie de novo corretamente."
      },
      despesa: {
        1: "Para lançar uma Despesa, vá em 'Registrar Operação' e selecione 'Retirada de Despesa'. Achou?",
        2: "Ótimo. Digite o Valor e informe com o que foi gasto na Observação. Pode mudar a 'Data da operação' se o gasto ocorreu em outro dia. Já colocou os dados?",
        3: "Basta clicar em 'Enviar Registro'. Ela fica 'Em Análise' até o escritório aprovar. Ao ser aprovada, o valor é SUBTRAÍDO do seu 'Físico (Confirmado)' em tempo real. Resolvido?",
        erro: "Se errar a despesa, basta avisar o escritório para eles recusarem ou alterarem o valor no momento da aprovação."
      },
      boleto: {
        1: "Para processar um boleto, abra a 'Central de Boletos' e clique na aba 'Conferir Novos'. Encontrou o seu boleto lá?",
        2: "Legal. Se os dados baterem, clique em 'Informar Pagamento Efetuado' e digite o valor exato que você pagou/retirou do caixa. Fez isso?",
        3: "Pronto! O boleto passa para 'Análise de Pagamento'. Quando o escritório confirmar essa baixa, o valor será DESCONTADO do seu 'Físico (Confirmado)'. Mais alguma dúvida?",
        erro: "Se houver erro no boleto (valor, número ou loja errada), use o botão de relatar problema/erro na hora de conferir para devolvê-lo ao escritório."
      },
      saldo: {
        1: "O 'Físico (Confirmado)' é o saldo real que deve estar na sua gaveta. Quer entender o que faz ele aumentar ou diminuir?",
        2: "Funciona assim: Sangrias aprovadas AUMENTAM o seu saldo. Despesas aprovadas e Boletos com pagamentos confirmados DIMINUEM o saldo. Tudo atualiza na hora. Entendido?",
        3: "Lembrando que operações 'Em Análise' ou 'Pendentes' não mudam o saldo até que o escritório as aprove e confirme. Mais alguma dúvida sobre o caixa?",
        erro: "Se o saldo estiver divergente, verifique se você não tem operações esquecidas 'Em Análise' ou boletos aguardando baixa do escritório."
      }
    };

    // TENTATIVA DE CONTINUAR O FLUXO (Se o usuário estiver no meio de um passo a passo)
    if (session.intent && flows[session.intent]) {
      if (isErrorQuery) {
        return responder(res, sessionId, session, flows[session.intent].erro);
      }
      if (isContinuation && session.step < Object.keys(flows[session.intent]).length - 1) {
        session.step += 1;
        return responder(res, sessionId, session, flows[session.intent][session.step]);
      }
    }

    // 5. BANCO DE RESPOSTAS LOCAIS ROBUSTAS (Sem IA, economia 100% de tokens)
    const localResponses = [
      // Acionadores de Fluxo (Roteamento Inteligente)
      {
        match: (m) => m.includes("como fazer") && m.includes("sangria") || m.includes("passo a passo sangria") || m.includes("lancar sangria"),
        action: () => { session.intent = "sangria"; session.step = 1; return flows.sangria[1]; }
      },
      {
        match: (m) => m.includes("como fazer") && m.includes("despesa") || m.includes("passo a passo despesa") || m.includes("lancar despesa"),
        action: () => { session.intent = "despesa"; session.step = 1; return flows.despesa[1]; }
      },
      {
        match: (m) => m.includes("como pagar") && m.includes("boleto") || m.includes("passo a passo boleto") || m.includes("baixar boleto"),
        action: () => { session.intent = "boleto"; session.step = 1; return flows.boleto[1]; }
      },
      {
        match: (m) => m.includes("entender") && m.includes("saldo") || m.includes("como funciona o caixa"),
        action: () => { session.intent = "saldo"; session.step = 1; return flows.saldo[1]; }
      },
      // Respostas Diretas e Específicas
      {
        match: (m) => m.includes("diferenca") && m.includes("sangria") && m.includes("despesa"),
        action: () => "A diferença no caixa é: a Sangria é uma ENTRADA (soma no saldo da loja) porque o dinheiro é separado para o escritório. Já a Despesa é uma SAÍDA (subtrai do saldo da loja) para pagar gastos. Ambas só alteram o saldo ao serem aprovadas."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("significa")) && m.includes("sangria"),
        action: () => "Sangria é uma operação onde a loja retira dinheiro do caixa físico e envia para o controle do escritório. Quando aprovada, ela SOMA no Saldo Físico Confirmado da loja."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("significa")) && m.includes("despesa"),
        action: () => "Despesa é o uso de dinheiro da gaveta da loja para pagar contas e gastos do dia a dia. Quando aprovada pelo escritório, ela SUBTRAI do Saldo Físico Confirmado da loja."
      },
      {
        match: (m) => (m.includes("aprova") || m.includes("aprovado")) && m.includes("sangria"),
        action: () => "Quando o escritório aprova uma sangria, o valor é SOMADO automaticamente ao saldo 'Físico (Confirmado)' da sua loja em tempo real."
      },
      {
        match: (m) => (m.includes("aprova") || m.includes("aprovado")) && m.includes("despesa"),
        action: () => "Quando o escritório aprova uma despesa, o valor é SUBTRAÍDO automaticamente do saldo 'Físico (Confirmado)' da sua loja em tempo real."
      },
      {
        match: (m) => m.includes("boleto") && (m.includes("desconta") || m.includes("abate") || m.includes("afeta")),
        action: () => "Sim. Quando a loja informa que pagou e o escritório confirma (dando a baixa), o valor pago do boleto é DESCONTADO automaticamente do saldo 'Físico (Confirmado)' da loja."
      },
      {
        match: (m) => m.includes("fisico confirmado") || (m.includes("saldo") && m.includes("significa")),
        action: () => "O 'Físico (Confirmado)' é o valor real em dinheiro que deve ter na loja. Ele aumenta com sangrias aprovadas e diminui com despesas aprovadas e confirmações de boletos pagos."
      },
      {
        match: (m) => m.includes("tempo real") || m.includes("aparece na tela") || m.includes("atualizar a pagina"),
        action: () => "O sistema é integrado em tempo real. Assim que o escritório aprova uma sangria/despesa ou dá baixa num boleto, o novo saldo aparece na tela automaticamente sem precisar atualizar a página."
      },
      {
        match: (m) => m.includes("data") && (m.includes("retroativ") || m.includes("antiga") || m.includes("esqueci") || m.includes("ontem")),
        action: () => "Se você esqueceu de lançar algo no dia certo, não tem problema. No formulário de registro, basta alterar o campo 'Data da operação' para informar o dia correto em que a sangria ou despesa realmente aconteceu."
      },
      {
        match: (m) => m.includes("analise de pagamento") || m.includes("analise pagamento"),
        action: () => "O status 'Análise de Pagamento' significa que você já informou ao sistema que pagou aquele boleto, e agora aguarda o escritório conferir e confirmar a baixa no seu saldo."
      },
      {
        match: (m) => m.includes("folha") && (m.includes("como funciona") || m.includes("o que e")),
        action: () => "A Folha de Conferência serve para calcular o Saldo Final. A matemática é: Saldo Anterior + Sangrias - Boletos Abatidos + PIX Recebido - Despesas = Saldo Final."
      },
      {
        match: (m) => m.includes("recuperar") || m.includes("senha") || m.includes("esqueci"),
        action: () => "Por questões de segurança, a recuperação de senha exige que o Administrador (Escritório) acesse seu computador via TeamViewer/AnyDesk para liberar a tela e você digitar a nova senha."
      },
      {
        match: (m) => /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem)\b/.test(m) && m.length < 30,
        action: () => "Olá! 👋 Sou o Assistente Smart Farma. Como posso te ajudar com o uso do sistema hoje?"
      }
    ];

    // Testa as respostas locais
    const localMatch = localResponses.find(rule => rule.match(msgLimpa));
    if (localMatch) {
      return responder(res, sessionId, session, localMatch.action());
    }

    // 6. FILTRO DE CONTEÚDO FORA DO ESCOPO
    const foraDeEscopo = /\b(receita federal|politica|esporte|futebol|clima|receita de bolo|piada|codigo|python|html|javascript)\b/.test(msgLimpa);
    if (foraDeEscopo) {
      return responder(res, sessionId, session, "Desculpe, eu sou programado exclusivamente para fornecer suporte e tirar dúvidas sobre as funcionalidades do sistema Smart Farma.");
    }

    // 7. PREPARAR RESUMO PARA A GROQ (Economia drástica de tokens)
    let contextHint = "";
    if (session.intent) {
      contextHint = `(O usuário estava conversando sobre o fluxo: ${session.intent.toUpperCase()}, etapa ${session.step}). `;
    }

    // 8. PROMPT DA IA CURTO, ESTRITO E SEGURO
    const systemPrompt = `Você é o Assistente Smart Farma (suporte interno).
REGRA MÁXIMA: NUNCA diga que você fez ou aprovou ações no sistema. Você APENAS orienta como usar. Não invente fluxos.
RESUMO REAL DO SISTEMA:
1. Sangria: ENTRADA no controle (SOMA no caixa da loja após o escritório aprovar).
2. Despesa: SAÍDA (SUBTRAI do caixa da loja após o escritório aprovar).
3. Boleto: Loja confere -> Loja informa pagamento -> Escritório aprova -> DESCONTA do saldo físico da loja.
4. Saldo Físico (Confirmado): O valor real. Atualiza em tempo real sem F5 após aprovações e baixas.
5. Datas: Ao lançar operações, o vendedor pode mudar a "Data da operação" para lançar pendências de dias anteriores.
INSTRUÇÃO: Seja gentil, curto e direto. ${contextHint}`;

    // 9. CHAMADA DA GROQ OTIMIZADA
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
        temperature: 0.1, // Quase zero = máximo de assertividade nos fatos
        max_tokens: 200   // Textos curtos
      })
    });

    if (!response.ok) {
      console.error("[Smart Farma Chatbot] Erro Groq:", await response.text());
      return res.status(502).json({ error: "Estou com instabilidade temporária na rede. Pode tentar de novo em instantes?" });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Não consegui entender, pode perguntar de outra forma?";

    return responder(res, sessionId, session, reply);

  } catch (e) {
    console.error("[Smart Farma Chatbot] Falha interna:", e);
    return res.status(500).json({ error: "Falha interna no servidor de suporte." });
  }
}

// 10. FUNÇÃO AUXILIAR PARA ATUALIZAR SESSÃO E RESPONDER
function responder(res, sessionId, session, replyText) {
  // Salva no cache de memória local
  sessionCache.set(sessionId, session);
  
  // Retorna a resposta e a session (caso o frontend queira armazenar para a próxima requisição)
  return res.status(200).json({ reply: replyText, session });
}