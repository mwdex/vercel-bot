export default async function handler(req, res) {
  // 1. HEADERS E CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    // 2. VALIDAÇÃO E SEGURANÇA BÁSICA
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem vazia ou inválida." });
    }

    const userMessage = message.trim();
    if (userMessage.length > 300) {
      return res.status(400).json({ error: "Sua mensagem é muito longa. Por favor, seja mais breve para que eu possa ajudar." });
    }

    // 3. NORMALIZAÇÃO DA MENSAGEM (Remove acentos, pontuação e deixa minúsculo)
    const msgLimpa = userMessage
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/gi, '')
      .toLowerCase()
      .trim();

    // 4. BANCO DE RESPOSTAS LOCAIS (Economia máxima de tokens)
    const localResponses = [
      // Saudações e Agradecimentos (limitado a textos curtos)
      {
        match: (m) => m.length < 35 && /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem)\b/.test(m),
        reply: "Olá! 👋 Sou o Assistente Smart Farma. Como posso te ajudar com as funções do sistema hoje?"
      },
      {
        match: (m) => m.length < 35 && /\b(obrigado|obrigada|valeu|vlw|top|ok|entendi|show|perfeito)\b/.test(m),
        reply: "Por nada! Qualquer outra dúvida sobre o sistema, é só chamar. 😉"
      },
      // Identidade do Bot
      {
        match: (m) => m.includes("quem e voce") || m.includes("quem e vc") || m.includes("pra que vc serve") || m.includes("o que vc faz"),
        reply: "Eu sou o Assistente Smart Farma, uma inteligência interna. Te ajudo a entender o sistema: boletos, sangrias, caixa e ferramentas."
      },
      {
        match: (m) => m.includes("quem te criou") || m.includes("quem fez voce") || m.includes("desenvolvedor"),
        reply: "Fui criado pelo Diego, desenvolvedor do Smart Farma, para facilitar seu dia a dia com o sistema!"
      },
      // Sangria e Despesa
      {
        match: (m) => m.includes("diferenca") && m.includes("sangria") && m.includes("despesa"),
        reply: "A diferença é simples: Sangria é o dinheiro que sai da loja e VAI para o escritório. Despesa é o dinheiro que sai da loja para GASTOS diversos do dia a dia."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("como enviar") || m.includes("fazer")) && m.includes("sangria"),
        reply: "A Sangria é a entrada (retirada) de dinheiro do caixa da loja que é enviada ao escritório. Após enviada, ela pode ficar com status pendente, aprovada, recusada ou modificada pelo admin."
      },
      {
        match: (m) => (m.includes("o que e") || m.includes("como lancar") || m.includes("o que significa")) && m.includes("despesa"),
        reply: "Despesa é o registro da saída de dinheiro direto do caixa da loja para cobrir gastos físicos ou operacionais."
      },
      // Boletos
      {
        match: (m) => m.includes("como funciona") && m.includes("boleto"),
        reply: "O vendedor pode conferir novos boletos, informar o pagamento em 'A Pagar' ou relatar erros. O escritório lança, revisa e aprova os pagamentos."
      },
      {
        match: (m) => m.includes("boleto pendente") || (m.includes("significa") && m.includes("pendente")),
        reply: "Boleto Pendente é um boleto novo lançado pelo escritório que ainda aguarda a conferência e confirmação da loja."
      },
      {
        match: (m) => m.includes("boleto confirmado") || (m.includes("significa") && m.includes("confirmado")),
        reply: "Boleto Confirmado significa que a loja já viu o boleto lançado e está ciente de que precisa realizar o pagamento."
      },
      {
        match: (m) => m.includes("analise de pagamento") || m.includes("analise pagamento"),
        reply: "Análise de Pagamento significa que a loja já informou que pagou o boleto e agora o sistema aguarda o escritório (Admin) conferir e validar a baixa."
      },
      {
        match: (m) => m.includes("boleto pago") || (m.includes("significa") && m.includes("pago") && m.includes("boleto")),
        reply: "Status Pago indica que o pagamento do boleto foi confirmado e baixado com sucesso pela auditoria do escritório."
      },
      {
        match: (m) => m.includes("boleto recusado") || m.includes("erro no boleto"),
        reply: "Boleto Recusado ocorre quando a loja relata um erro (valor, número ou loja errada) ou o escritório recusa a conferência do pagamento."
      },
      // Folha, Caixa e Saldo
      {
        match: (m) => (m.includes("como funciona") || m.includes("o que e")) && m.includes("folha"),
        reply: "A Folha de Conferência calcula o Saldo Final da loja da seguinte forma: Saldo Anterior + Sangrias - Boletos Abatidos + PIX Recebido - Despesas. Ela atualiza seu saldo físico."
      },
      {
        match: (m) => m.includes("saldo da loja") || m.includes("saldo inicial"),
        reply: "O saldo da loja é calculado automaticamente na Folha de Conferência. Se a sua loja ainda não tem um saldo inicial registrado, o sistema pedirá esse valor no seu primeiro acesso."
      },
      {
        match: (m) => m.includes("diferenca") && m.includes("loja") && m.includes("escritorio"),
        reply: "O caixa do Escritório tem saldo independente das lojas. O Admin gerencia as entradas e saídas do escritório, enquanto a loja cuida apenas da sua própria folha de conferência."
      },
      // Login, Senha e Acesso
      {
        match: (m) => m.includes("login") || m.includes("acesso") || m.includes("recuperar") || m.includes("senha"),
        reply: "O login é numérico. Novos acessos precisam ser aprovados. Para recuperar a senha local, é obrigatória a validação do Admin via acesso remoto (TeamViewer ou AnyDesk)."
      }
    ];

    // Verifica se a pergunta bate com alguma regra local
    const localMatch = localResponses.find(rule => rule.match(msgLimpa));
    if (localMatch) {
      return res.status(200).json({ reply: localMatch.reply });
    }

    // 5. PROMPT OTIMIZADO PARA A IA (Curto, Econômico e Direto)
    const systemPrompt = `Você é o Assistente Smart Farma, suporte interno (criado por Diego).
REGRA: Responda apenas sobre o uso do sistema Smart Farma, em PT-BR, de forma curta e direta. NUNCA diga que executou ações (você só orienta).

MANUAL DO SISTEMA:
- ACESSO: Vendedor(Loja) ou Admin(Escritório). Login numérico. Novos acessos requerem aprovação. Recuperar senha exige Admin (TeamViewer/AnyDesk).
- SANGRIA: Dinheiro do caixa da loja enviado ao escritório (pendente, aprovada, recusada, modificada).
- DESPESA: Dinheiro retirado do caixa da loja para gastos.
- BOLETOS(Loja): 'Conferir Novos', 'A Pagar'. Status: pendente(novo), confirmado(loja ciente), analise_pagamento(loja pagou, aguarda admin), pago(baixado), recusado(erro).
- FOLHA DE CONFERÊNCIA(Loja): Saldo Final = Saldo Anterior + Sangrias - Boletos + PIX - Despesa. Pede saldo atual no 1º acesso se não houver. Boletos pendentes vão para analise_pagamento.
- ADMIN(Escritório): Caixa independente (adiciona/retira fundos). Lança boleto (bipador/lote). Conferência audita folhas (Certo=Aprovado/Pago, Errado=Recusado). Gerencia acessos.`;

    // 6. CHAMADA PARA A GROQ (Configurada para gastar menos tokens)
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
        temperature: 0.1, // Quase zero para manter a IA focada apenas nos fatos do sistema
        max_tokens: 250   // Reduzido para economizar tokens, forçando respostas mais curtas
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Smart Farma Chatbot] Erro Groq:", errorText);
      return res.status(502).json({ error: "No momento não consegui processar sua dúvida. Tente novamente em 1 minuto." });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Desculpe, não consegui formular uma resposta clara agora.";

    return res.status(200).json({ reply });
  } catch (e) {
    console.error("[Smart Farma Chatbot] Falha interna:", e);
    return res.status(500).json({ error: "Falha interna no servidor de suporte." });
  }
}