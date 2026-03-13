// api/chat.js

// 1. MEMÓRIA CURTA (CACHE DE SESSÃO) ISOLADA POR USUÁRIO
// Mantém o estado da conversa em memória nas instâncias ativas para continuidade de fluxo.
// A privacidade é garantida exigindo um sessionId único e nunca usando fallback compartilhado.
const sessionCache = new Map();

// Tempo máximo para considerar a memória válida (15 minutos)
const SESSION_TTL = 15 * 60 * 1000;

// Função para limpar sessões inativas e evitar vazamento de memória em instâncias contínuas
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

    // PRIVACIDADE OBRIGATÓRIA: Se não houver sessionId no frontend, criamos um exclusivo na hora.
    // NUNCA mais usaremos 'default-user' ou strings estáticas para evitar mesclar conversas de lojas diferentes.
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    const userMessage = message.trim();
    if (userMessage.length > 300) {
      return res.status(400).json({ reply: "Sua mensagem é muito longa. Por favor, seja mais breve." });
    }

    // 2. NORMALIZAÇÃO (Sem acentos, pontuação mínima e minúsculo)
    const msgLimpa = userMessage
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // 3. RECUPERAR MEMÓRIA DA SESSÃO REAL DO USUÁRIO
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = { intent: null, step: 0, lastUpdated: Date.now() };
    } else {
      session.lastUpdated = Date.now();
    }

    // 4. DETECÇÃO FORTE DE CONTINUIDADE (Impede inventar comandos para "agr", "ok", etc.)
    const regexContinuacao = /\b(e agr|agr|e agora|agora|depois|proximo passo|proximo|pronto|ja fiz|coloquei|adicionei|enviei|e ai|e a\u00ed|fiz isso|sim|ok|achei|encontrei|continue)\b/i;
    const isContinuation = regexContinuacao.test(msgLimpa);
    
    const isErrorQuery = /\b(errar|errei|erro|corrigir|se der erro|consertar|fiz errado)\b/.test(msgLimpa);

    // FLUXOS GUIADOS LOCAIS (Refletindo o funcionamento REAL do sistema Smart Farma)
    const flows = {
      sangria: {
        1: "Para lançar uma Sangria, primeiro acesse a área 'Registrar Operação' no painel e selecione o tipo 'Sangria'. Conseguiu achar?",
        2: "Ótimo. Agora informe o valor exato, escreva uma observação (motivo) e, se necessário, ajuste a 'Data da operação' (caso esteja lançando algo de outro dia). Já preencheu?",
        3: "Agora é só clicar em 'Enviar Registro'. A sua operação ficará com o status 'Em Análise'. Entendido?",
        4: "Por fim, o escritório fará a avaliação. Assim que eles aprovarem, o valor será SOMADO automaticamente ao saldo 'Físico (Confirmado)' da loja. Posso ajudar com mais algo?",
        erro: "Se você errar o valor ou o motivo, não se preocupe. O escritório pode modificar o valor ou recusar a operação para que você envie de novo corretamente."
      },
      despesa: {
        1: "Para lançar uma Despesa, acesse a área 'Registrar Operação' e escolha 'Retirada de Despesa'. Encontrou?",
        2: "Perfeito. Informe o valor que foi gasto, preencha a observação detalhando a despesa e ajuste a 'Data da operação' caso o gasto tenha ocorrido em outro dia. Tudo preenchido?",
        3: "Basta clicar em 'Enviar Registro'. Ela ficará 'Em Análise' aguardando o escritório. Tudo certo até aqui?",
        4: "Assim que o escritório aprovar, o valor será SUBTRAÍDO automaticamente do seu saldo 'Físico (Confirmado)'. Mais alguma dúvida?",
        erro: "Se errar o lançamento da despesa, avise o escritório para que eles recusem a operação ou ajustem o valor na hora de aprovar."
      },
      boleto: {
        1: "Para pagar um boleto, abra a 'Central de Boletos' e clique na aba '1. Conferir Novos'. Achou o boleto lá?",
        2: "Legal. Se estiver tudo certo, clique em 'Informar Pagamento Efetuado' e digite o valor exato que você retirou do caixa para pagar. Fez isso?",
        3: "Pronto, agora ele fica em 'Análise de Pagamento'. O escritório vai avaliar e confirmar essa baixa. Tudo entendido?",
        4: "Quando o escritório confirmar, o boleto passa para 'Pago' e o valor é DESCONTADO automaticamente do seu saldo 'Físico (Confirmado)'. Ajudo com mais algo?",
        erro: "Se houver erro no boleto (valor, número ou loja errada), use o botão de relatar problema na hora da conferência para devolvê-lo ao escritório."
      },
      saldo: {
        1: "O 'Físico (Confirmado)' é o saldo real em dinheiro que deve estar na sua gaveta da loja. Quer entender o que faz ele aumentar ou diminuir?",
        2: "Funciona assim: Sangrias aprovadas AUMENTAM o seu saldo. Despesas aprovadas e Boletos com pagamentos confirmados DIMINUEM o saldo. Tudo isso atualiza na hora na sua tela. Entendido?",
        3: "Vale lembrar que operações 'Em Análise' não mudam o saldo. Elas só afetam o Físico Confirmado após a aprovação do escritório. Mais alguma dúvida?",
        erro: "Se o seu saldo físico estiver divergente, verifique no Histórico se há operações antigas pendentes, recusadas ou boletos que o escritório ainda não deu baixa."
      }
    };

    // EXECUÇÃO DA CONTINUIDADE DO FLUXO NA MEMÓRIA
    if (session.intent && flows[session.intent]) {
      if (isErrorQuery) {
        return responder(res, sessionId, session, flows[session.intent].erro);
      }
      if (isContinuation) {
        if (session.step < Object.keys(flows[session.intent]).length - 1) { // -1 ignora a prop 'erro'
          session.step += 1;
          return responder(res, sessionId, session, flows[session.intent][session.step]);
        } else {
          // Fim do fluxo, limpa a intenção para não prender o bot nesse assunto infinitamente
          session.intent = null;
          session.step = 0;
          if (msgLimpa === 'ok' || msgLimpa === 'sim' || msgLimpa === 'pronto') {
             return responder(res, sessionId, session, "Perfeito! Se precisar de ajuda com outra funcionalidade do Smart Farma, é só perguntar.");
          }
        }
      }
    }

    // BLOQUEIO ANTI-ALUCINAÇÃO PARA TERMOS CURTOS FORA DE CONTEXTO
    // Se o usuário mandar "agr", "ok" ou "pronto" do nada, sem fluxo ativo, encerramos gentilmente.
    if (!session.intent && (msgLimpa === "ok" || msgLimpa === "sim" || msgLimpa === "agr" || msgLimpa === "e agora" || msgLimpa === "pronto")) {
        return responder(res, sessionId, session, "Estou à disposição! Qual funcionalidade do sistema você quer entender agora?");
    }

    // 5. BANCO GIGANTE DE RESPOSTAS LOCAIS (Economia 100% de Tokens da Groq)
    const localResponses = [
      // Acionadores de Fluxo Guiado
      {
        match: (m) => (m.includes("como fazer") || m.includes("passo a passo") || m.includes("lancar") || m.includes("enviar")) && m.includes("sangria"),
        action: () => { session.intent = "sangria"; session.step = 1; return flows.sangria[1]; }
      },
      {
        match: (m) => (m.includes("como fazer") || m.includes("passo a passo") || m.includes("lancar") || m.includes("enviar")) && m.includes("despesa"),
        action: () => { session.intent = "despesa"; session.step = 1; return flows.despesa[1]; }
      },
      {
        match: (m) => (m.includes("como pagar") || m.includes("passo a passo") || m.includes("baixar")) && m.includes("boleto"),
        action: () => { session.intent = "boleto"; session.step = 1; return flows.boleto[1]; }
      },
      {
        match: (m) => m.includes("entender") && m.includes("saldo") || m.includes("como funciona o caixa"),
        action: () => { session.intent = "saldo"; session.step = 1; return flows.saldo[1]; }
      },
      
      // Respostas Diretas / Dúvidas Frequentes
      {
        match: (m) => m.includes("diferenca") && m.includes("sangria") && m.includes("despesa"),
        action: () => "A principal diferença é o impacto no caixa após a aprovação: a Sangria SOMA no seu saldo 'Físico (Confirmado)' (pois é um dinheiro repassado ao controle), enquanto a Despesa SUBTRAI do saldo (pois é dinheiro gasto pela loja)."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("significa")) && m.includes("sangria") && !m.includes("como fazer"),
        action: () => "Sangria é uma entrada no controle do caixa da loja para o escritório. Quando o escritório aprova, o valor dela é SOMADO no seu 'Físico (Confirmado)'."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("significa")) && m.includes("despesa") && !m.includes("como fazer"),
        action: () => "A Despesa é o registro de um gasto pago com o dinheiro da loja. Quando o escritório aprova, ela atua como saída e SUBTRAI o valor do seu 'Físico (Confirmado)'."
      },
      {
        match: (m) => (m.includes("aprova") || m.includes("aprovado") || m.includes("acontece")) && m.includes("sangria") && !m.includes("despesa"),
        action: () => "Quando o escritório aprova uma sangria, o valor é SOMADO automaticamente ao saldo 'Físico (Confirmado)' da loja. A tela é atualizada em tempo real."
      },
      {
        match: (m) => (m.includes("aprova") || m.includes("aprovado") || m.includes("acontece")) && m.includes("despesa") && !m.includes("sangria"),
        action: () => "Quando o escritório aprova uma despesa, o valor é SUBTRAÍDO automaticamente do saldo 'Físico (Confirmado)' da loja. A tela é atualizada em tempo real."
      },
      {
        match: (m) => m.includes("boleto") && (m.includes("desconta") || m.includes("abate") || m.includes("afeta") || m.includes("subtrai")),
        action: () => "Sim. Depois que a loja informa o pagamento e o escritório confirma a baixa desse boleto, o valor pago é DESCONTADO automaticamente do saldo 'Físico (Confirmado)'."
      },
      {
        match: (m) => m.includes("fisico confirmado") || (m.includes("saldo") && m.includes("significa")),
        action: () => "O 'Físico (Confirmado)' representa o saldo real que deve existir no seu caixa. Ele é afetado em tempo real por aprovações de sangrias (aumenta) e despesas ou boletos (diminui)."
      },
      {
        match: (m) => m.includes("tempo real") || m.includes("aparece na tela") || m.includes("atualizar a pagina"),
        action: () => "Sim! O Smart Farma é integrado em tempo real. Assim que o escritório aprova ou recusa uma operação, o novo saldo e o histórico aparecem na sua tela sem precisar recarregar a página."
      },
      {
        match: (m) => m.includes("data") && (m.includes("retroativ") || m.includes("antiga") || m.includes("esqueci") || m.includes("ontem") || m.includes("mudar")),
        action: () => "O sistema possui um campo 'Data da operação'. Se você esqueceu de lançar algo no dia correto, basta alterar essa data no formulário para o dia real em que a sangria ou despesa ocorreu."
      },
      {
        match: (m) => m.includes("analise de pagamento") || m.includes("analise pagamento"),
        action: () => "O status 'Análise de Pagamento' aparece depois que você informa o valor pago do boleto. Agora você só precisa aguardar o escritório conferir e dar a baixa para descontar do seu saldo."
      },
      {
        match: (m) => m.includes("folha") && (m.includes("como funciona") || m.includes("o que e")),
        action: () => "A Folha de Conferência consolida o seu caixa. A conta é: Saldo Anterior + Sangrias aprovadas - Boletos Abatidos + PIX - Despesas = Saldo Final Declarado."
      },
      {
        match: (m) => m.includes("recuperar") || m.includes("senha") || m.includes("esqueci"),
        action: () => "Para recuperar ou alterar a senha localmente, é necessário que o Escritório (Admin) valide a ação pelo seu computador (via TeamViewer/AnyDesk) desbloqueando a tela para você inserir a nova senha."
      },
      {
        match: (m) => /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem)\b/.test(m) && m.length < 30,
        action: () => "Olá! 👋 Sou o Assistente Smart Farma. Como posso ajudar você com o sistema hoje?"
      }
    ];

    // Testa as respostas locais antes da IA
    const localMatch = localResponses.find(rule => rule.match(msgLimpa));
    if (localMatch) {
      return responder(res, sessionId, session, localMatch.action());
    }

    // 6. FILTRO DE CONTEÚDO FORA DO ESCOPO (Evita que o bot fale de outras coisas)
    const foraDeEscopo = /\b(receita federal|politica|esporte|futebol|clima|receita de bolo|piada|codigo|python|html|javascript|farmacia popular)\b/.test(msgLimpa);
    if (foraDeEscopo) {
      return responder(res, sessionId, session, "Desculpe, meu conhecimento é restrito. Sou configurado exclusivamente para explicar e tirar dúvidas sobre as funcionalidades do sistema interno Smart Farma.");
    }

    // 7. PREPARAR RESUMO DE CONTEXTO PARA A GROQ (Econômico e Focado)
    let contextHint = "";
    if (session.intent) {
      contextHint = `[CONTEXTO: O usuário está no meio do passo a passo sobre '${session.intent.toUpperCase()}', etapa ${session.step}]. `;
    }

    // 8. PROMPT DA IA (Enxuto, Rigoroso e Direto)
    const systemPrompt = `Você é o Assistente do sistema Smart Farma.
REGRA MÁXIMA: NUNCA diga que você executou, aprovou ou alterou algo no sistema. Você APENAS orienta como usar. Não invente fluxos ou recursos.
RESUMO REAL DO SISTEMA:
1. Sangria: ENTRADA. Aprovada pelo escritório -> SOMA no Físico Confirmado da loja.
2. Despesa: SAÍDA. Aprovada pelo escritório -> SUBTRAI do Físico Confirmado da loja.
3. Boleto: Loja confere -> Loja informa pagamento -> Escritório avalia -> Se confirmado, passa a Pago e DESCONTA do saldo físico da loja.
4. Saldo Físico: Atualiza em tempo real sem recarregar a tela.
5. Datas: Pode-se alterar a "Data da operação" no envio para refletir dias passados.
INSTRUÇÃO: Seja gentil, claro, curto e responda apenas o que foi perguntado. ${contextHint}`;

    // 9. CHAMADA DA GROQ OTIMIZADA PARA CUSTO E PRECISÃO
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
        temperature: 0.1, // Temperatura baixa para não alucinar fluxos inexistentes
        max_tokens: 250   // Respostas mais curtas e baratas
      })
    });

    if (!response.ok) {
      console.error("[Smart Farma Chatbot] Erro Groq:", await response.text());
      return res.status(502).json({ reply: "No momento nossa rede está com instabilidade. Por favor, tente novamente em instantes." });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Desculpe, não compreendi. Pode perguntar de outra forma relacionada ao Smart Farma?";

    return responder(res, sessionId, session, reply);

  } catch (e) {
    console.error("[Smart Farma Chatbot] Falha interna:", e);
    return res.status(500).json({ reply: "Falha interna no servidor de suporte. Tente novamente mais tarde." });
  }
}

// 10. FUNÇÃO AUXILIAR PARA ATUALIZAR SESSÃO E RESPONDER
function responder(res, sessionId, session, replyText) {
  sessionCache.set(sessionId, session);
  return res.status(200).json({ reply: replyText, sessionId: sessionId });
}