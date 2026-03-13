// api/chat.js

// 1. MEMÓRIA CURTA (CACHE DE SESSÃO) ISOLADA POR USUÁRIO
const sessionCache = new Map();
const SESSION_TTL = 15 * 60 * 1000;

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

    // PRIVACIDADE GARANTIDA: Sempre existirá um identificador único, nunca mesclando conversas.
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    const userMessage = message.trim();
    if (userMessage.length > 300) {
      return res.status(400).json({ reply: "Sua mensagem é muito longa. Por favor, seja mais breve." });
    }

    // 2. NORMALIZAÇÃO DE TEXTO
    const msgLimpa = userMessage
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // 3. RECUPERAR MEMÓRIA DA SESSÃO ATUAL
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = { intent: null, step: 0, lastUpdated: Date.now() };
    } else {
      session.lastUpdated = Date.now();
    }

    // 4. DETECÇÃO FORTE DE CONTINUIDADE
    // Bloqueia interpretações como funções inexistentes e obriga a seguir o fluxo local.
    const regexContinuacao = /\b(e agr|agr|e agora|agora|depois|pr[oó]ximo( passo)?|pronto|j[aá] fiz|coloquei( o valor)?|adicionei|enviei|e a[ií]|fiz( isso)?|sim|ok|achei|encontrei|continue)\b/i;
    const isContinuation = regexContinuacao.test(msgLimpa);
    
    const isErrorQuery = /\b(errar|errei|erro|corrigir|se der erro|consertar|fiz errado)\b/.test(msgLimpa);

    // FLUXOS GUIADOS LOCAIS 100% CORRIGIDOS (Mapeiam o funcionamento REAL)
    const flows = {
      sangria: {
        1: "Para registrar uma sangria:\n\n1. Abra a área da loja e vá em 'Registrar Operação'.\n2. Escolha o tipo 'Sangria'.\n\nConseguiu encontrar?",
        2: "Ótimo! Agora informe o valor exato, escreva a observação (motivo) e, se necessário, ajuste a 'Data da operação' (caso esteja lançando algo de outro dia). Preencheu tudo?",
        3: "Perfeito. Agora basta clicar em 'Enviar Registro'. A sangria ficará com o status 'Em Análise' aguardando o escritório. Entendido?",
        4: "Depois disso, o escritório irá avaliar. Se aprovada, a sangria SOMA automaticamente no 'Físico (Confirmado)' da loja. Posso ajudar com mais alguma coisa?",
        erro: "Se você errar o valor ou a observação, não se preocupe. O escritório pode modificar o valor na hora de avaliar ou recusar a operação para que você envie de novo."
      },
      despesa: {
        1: "Para registrar uma despesa:\n\n1. Abra a área 'Registrar Operação'.\n2. Escolha o tipo 'Retirada de Despesa'.\n\nEncontrou?",
        2: "Legal. Agora informe o valor gasto, escreva a observação com o detalhe da despesa e ajuste a 'Data da operação' se o gasto ocorreu em outro dia. Já colocou os dados?",
        3: "Basta clicar em 'Enviar Registro'. Ela ficará 'Em Análise' aguardando o escritório. Tudo certo até aqui?",
        4: "Assim que o escritório aprovar a operação, o valor será SUBTRAÍDO automaticamente do seu 'Físico (Confirmado)'. Mais alguma dúvida?",
        erro: "Se errar no lançamento da despesa, avise o escritório para que eles recusem a operação ou ajustem o valor na aprovação."
      },
      boleto: {
        1: "Para processar um boleto, abra a 'Central de Boletos' e clique na aba '1. Conferir Novos'. Achou o seu boleto lá?",
        2: "Legal. Se os dados estiverem certos, clique em 'Informar Pagamento Efetuado' e digite o valor exato que você retirou do caixa para pagar. Fez isso?",
        3: "Pronto, o boleto passa para 'Análise de Pagamento'. Agora o escritório vai avaliar e confirmar essa baixa. Tudo entendido?",
        4: "Quando o escritório confirmar, ele passa para o status 'Pago' e o valor é DESCONTADO automaticamente do seu saldo 'Físico (Confirmado)'. Ajudo com mais algo?",
        erro: "Se houver erro no boleto (valor, número ou loja errada), clique no botão de relatar erro na hora de conferir para devolvê-lo ao escritório."
      },
      saldo: {
        1: "O 'Físico (Confirmado)' é o saldo real em dinheiro que deve estar na gaveta da loja. Quer saber o que faz ele aumentar ou diminuir?",
        2: "Funciona assim: Sangrias aprovadas AUMENTAM o seu saldo. Despesas aprovadas e Boletos com pagamentos confirmados DIMINUEM o saldo. Tudo isso atualiza na mesma hora na sua tela. Entendido?",
        3: "Lembrando: operações com status 'Em Análise' não mudam o saldo. Elas só afetam o caixa depois que o escritório as aprova. Mais alguma dúvida?",
        erro: "Se o seu saldo físico estiver divergente, verifique no Histórico se há operações antigas pendentes, recusadas ou boletos aguardando baixa do escritório."
      }
    };

    // EXECUÇÃO DO FLUXO PELA MEMÓRIA (Atua antes de pensar em IA)
    if (session.intent && flows[session.intent]) {
      if (isErrorQuery) {
        return responder(res, sessionId, session, flows[session.intent].erro);
      }
      if (isContinuation) {
        // Quantidade total de passos do fluxo (ignorando a chave "erro")
        const maxSteps = Object.keys(flows[session.intent]).filter(k => k !== 'erro').length;
        
        if (session.step < maxSteps) {
          session.step += 1;
          return responder(res, sessionId, session, flows[session.intent][session.step]);
        } else {
          session.intent = null;
          session.step = 0;
          return responder(res, sessionId, session, "Perfeito! Se precisar de ajuda com outra funcionalidade do Smart Farma, é só perguntar.");
        }
      }
    }

    // PROTEÇÃO ANTI-ALUCINAÇÃO DIRETA:
    // Se o usuário mandar uma mensagem curta de continuação (ex: "e agr", "pronto") 
    // e NÃO houver fluxo ativo, ele ignora a IA e responde amigavelmente.
    if (!session.intent && isContinuation) {
        return responder(res, sessionId, session, "Estou à disposição! Qual funcionalidade do sistema você quer entender agora?");
    }

    // 5. BANCO DE RESPOSTAS LOCAIS COMPLETAS
    const localResponses = [
      {
        match: (m) => (m.includes("como fazer") || m.includes("passo a passo") || m.includes("lancar") || m.includes("enviar") || m.includes("registrar") || m.includes("como faco")) && m.includes("sangria"),
        action: () => { session.intent = "sangria"; session.step = 1; return flows.sangria[1]; }
      },
      {
        match: (m) => (m.includes("como fazer") || m.includes("passo a passo") || m.includes("lancar") || m.includes("enviar") || m.includes("registrar") || m.includes("como faco")) && m.includes("despesa"),
        action: () => { session.intent = "despesa"; session.step = 1; return flows.despesa[1]; }
      },
      {
        match: (m) => (m.includes("como pagar") || m.includes("passo a passo") || m.includes("baixar") || m.includes("como faco com")) && m.includes("boleto"),
        action: () => { session.intent = "boleto"; session.step = 1; return flows.boleto[1]; }
      },
      {
        match: (m) => m.includes("entender") && m.includes("saldo") || m.includes("como funciona o caixa"),
        action: () => { session.intent = "saldo"; session.step = 1; return flows.saldo[1]; }
      },
      {
        match: (m) => m.includes("diferenca") && m.includes("sangria") && m.includes("despesa"),
        action: () => "A principal diferença é o impacto no caixa após a aprovação do escritório: a Sangria SOMA no seu saldo 'Físico (Confirmado)' (pois é dinheiro enviado ao escritório), enquanto a Despesa SUBTRAI do saldo (pois é dinheiro gasto pela loja)."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("significa") || m.includes("o que seria")) && m.includes("sangria") && !m.includes("como fazer"),
        action: () => "A Sangria é o envio do dinheiro físico do caixa da loja para o controle do escritório. Você lança, envia para análise, e quando o escritório aprova, o valor dela é SOMADO no seu Físico (Confirmado)."
      },
      {
        match: (m) => (m.includes("aprova") || m.includes("aprovado") || m.includes("acontece")) && m.includes("sangria") && !m.includes("despesa"),
        action: () => "Quando o escritório avalia e aprova a sangria, o valor é SOMADO automaticamente ao saldo 'Físico (Confirmado)' da loja. A tela é atualizada em tempo real."
      },
      {
        match: (m) => (m.includes("aprova") || m.includes("aprovado") || m.includes("acontece")) && m.includes("despesa") && !m.includes("sangria"),
        action: () => "Quando o escritório avalia e aprova uma despesa, o valor é SUBTRAÍDO automaticamente do saldo 'Físico (Confirmado)' da loja. A tela atualiza em tempo real."
      },
      {
        match: (m) => m.includes("boleto") && (m.includes("desconta") || m.includes("abate") || m.includes("afeta") || m.includes("subtrai")),
        action: () => "Sim. Depois que a loja informa o pagamento e o escritório confere e confirma a baixa, o valor pago do boleto é DESCONTADO automaticamente do saldo 'Físico (Confirmado)'."
      },
      {
        match: (m) => m.includes("fisico confirmado") || (m.includes("saldo") && m.includes("significa")),
        action: () => "O 'Físico (Confirmado)' representa o saldo real que deve existir na sua gaveta. Ele é afetado em tempo real por aprovações de sangrias (soma) e despesas ou boletos pagos (subtrai)."
      },
      {
        match: (m) => m.includes("tempo real") || m.includes("aparece na tela") || m.includes("atualizar a pagina"),
        action: () => "Sim! O Smart Farma funciona em tempo real. Assim que o escritório aprova uma operação, o novo saldo e o histórico aparecem na sua tela na mesma hora, sem precisar recarregar a página."
      },
      {
        match: (m) => m.includes("data") && (m.includes("retroativ") || m.includes("antiga") || m.includes("esqueci") || m.includes("ontem") || m.includes("mudar")),
        action: () => "O sistema possui o campo 'Data da operação'. Se você esqueceu de lançar algo no dia correto, basta alterar essa data no momento do envio para o dia real em que a sangria ou despesa ocorreu."
      },
      {
        match: (m) => /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem)\b/.test(m) && m.length < 30,
        action: () => "Olá! 👋 Sou o Assistente Smart Farma. Como posso te ajudar a usar o sistema hoje?"
      }
    ];

    const localMatch = localResponses.find(rule => rule.match(msgLimpa));
    if (localMatch) {
      return responder(res, sessionId, session, localMatch.action());
    }

    // 6. FILTRO FORA DO ESCOPO
    const foraDeEscopo = /\b(receita federal|politica|esporte|futebol|clima|receita de bolo|piada|codigo|python|html|javascript|farmacia popular)\b/.test(msgLimpa);
    if (foraDeEscopo) {
      return responder(res, sessionId, session, "Desculpe, meu conhecimento é restrito. Fui configurado exclusivamente para explicar e tirar dúvidas sobre as funcionalidades do sistema interno Smart Farma.");
    }

    // 7. PREPARAR IA
    let contextHint = "";
    if (session.intent) {
      contextHint = `[O usuário está no meio do passo a passo sobre '${session.intent.toUpperCase()}', etapa ${session.step}]. `;
    }

    const systemPrompt = `Você é o Assistente do sistema Smart Farma.
REGRA MÁXIMA: NUNCA diga que executou ou aprovou ações no sistema. Você APENAS orienta. Não invente botões.
RESUMO REAL DE FLUXOS:
1. Sangria: Vendedor abre Registrar Operação -> escolhe Sangria -> informa valor, observação, data -> envia para análise -> Escritório avalia -> Se aprovada, SOMA no Físico Confirmado da loja.
2. Despesa: Idem acima, mas SUBTRAI do Físico Confirmado.
3. Boleto: Loja confere -> informa pagamento -> Escritório confirma baixa -> DESCONTA do saldo físico da loja.
INSTRUÇÃO: Seja gentil, claro e super direto. Se o usuário mandar texto solto como "agr", ignore IA criativa e apenas pergunte em que processo ele está. ${contextHint}`;

    // 8. CHAMADA DA IA OTIMIZADA
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

    if (!response.ok) return res.status(502).json({ reply: "Estou com instabilidade na rede. Pode tentar de novo em instantes?" });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Pode reformular a pergunta relacionada ao Smart Farma?";

    return responder(res, sessionId, session, reply);

  } catch (e) {
    return res.status(500).json({ reply: "Falha interna no servidor de suporte. Tente novamente mais tarde." });
  }
}

// ATUALIZADOR DE ESTADO
function responder(res, sessionId, session, replyText) {
  sessionCache.set(sessionId, session);
  return res.status(200).json({ reply: replyText, sessionId: sessionId });
}