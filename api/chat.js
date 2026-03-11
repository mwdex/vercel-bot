export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem vazia" });
    }

    // =====================================================================
    // 1. FILTRO DE MEMÓRIA LOCAL (Mantido para economizar IA em saudações)
    // =====================================================================
    const msgOriginal = message.trim().toLowerCase();
    const msgLimpa = msgOriginal.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '').trim();

    if (msgLimpa.length < 25) {
      if (msgLimpa.includes("oi") || msgLimpa.includes("ola") || msgLimpa.includes("bom dia") || msgLimpa.includes("boa tarde") || msgLimpa.includes("boa noite") || msgLimpa.includes("tudo bem")) {
        return res.status(200).json({ reply: "Olá! 👋 Sou o Assistente Smart Farma. Como posso te ajudar com as funções do sistema hoje?" });
      }
      if (msgLimpa.includes("obrigado") || msgLimpa.includes("obrigada") || msgLimpa === "valeu" || msgLimpa === "vlw" || msgLimpa === "top" || msgLimpa === "ok" || msgLimpa.includes("entendi") || msgLimpa === "show") {
        return res.status(200).json({ reply: "Por nada! Qualquer outra dúvida sobre o sistema, é só chamar. 😉" });
      }
    }
    if (msgLimpa.includes("quem e voce") || msgLimpa.includes("quem e vc") || msgLimpa.includes("pra que vc serve") || msgLimpa.includes("o que vc faz")) {
      return res.status(200).json({ reply: "Eu sou o Assistente Smart Farma, uma inteligência interna do sistema. Estou aqui para te ajudar a entender como lançar boletos, enviar sangrias, montar folhas de caixa e usar as ferramentas." });
    }
    if (msgLimpa.includes("quem te criou") || msgLimpa.includes("quem fez voce") || msgLimpa.includes("quem desenvolveu")) {
      return res.status(200).json({ reply: "Eu fui criado pelo Diego, desenvolvedor do Smart Farma, para ajudar no dia a dia com o sistema!" });
    }

    // =====================================================================
    // 2. PROMPT OTIMIZADO (Rico em detalhes, mas compacto)
    // =====================================================================
    const systemPrompt = `Você é o Assistente Smart Farma, suporte interno criado por Diego.
REGRA: Explique como usar o sistema. NUNCA diga que você executou ações (você não tem acesso a botões ou banco de dados, apenas orienta). Responda em PT-BR, curto e direto. Recuse assuntos fora do sistema.

MANUAL DO SISTEMA SMART FARMA:
1. GERAL: Acesso Vendedor (Loja) e Admin (Escritório). Login numérico. Novos acessos precisam de aprovação. Recuperação de senha local exige validação do Admin via TeamViewer/AnyDesk.
2. SANGRIA (Entrada no caixa): Retirada de dinheiro enviada ao escritório. Status: pendente (aguarda), aprovada (aceita), recusada (com motivo), modificada (valor ajustado).
3. DESPESA (Saída do caixa): Dinheiro retirado do caixa da loja para gastos.
4. BOLETOS (Vendedor): 
   - 'Conferir Novos': Confirma dados ou relata erro (Valor incorreto, Número errado, Boleto de outra loja).
   - 'A Pagar': Informa pagamento. Pode ter diferença (juros/desconto).
   - Status Boletos: pendente (novo), confirmado (loja ciente), analise_pagamento (loja pagou, aguarda admin validar), pago (baixado), recusado (erro relatado).
5. FOLHA DE CONFERÊNCIA (Caixa Loja):
   - Cálculo: Saldo Final = Saldo Anterior + Total Sangrias - Boletos Abatidos + PIX Recebido - Despesa da Loja.
   - Atualiza o Saldo Físico (Dinheiro) da loja. Se a loja não tem saldo inicial, um modal pede o saldo atual no 1º acesso.
   - Boletos pendentes incluídos na folha abrem modal para informar valor pago (vão para analise_pagamento).
6. ADMIN (Escritório):
   - Caixa Escritório: Saldo independente das lojas. Admin adiciona/retira fundos (exige motivo).
   - Lançar Boleto: Pode usar BIPADOR. Adiciona à fila -> Revisa -> Envia lote (ficam pendentes nas lojas).
   - Conferência de Caixas: Audita folhas. Marca itens como Certo (vira Aprovado/Pago) ou Errado (vira Recusado/Analise).
   - Equipe/Lojas: Visualiza grids com saldos, pendências e cria acessos.`;

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
          { role: "user", content: message.trim() }
        ],
        temperature: 0.2, // Temperatura baixa para ela ser precisa e não inventar coisas
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Smart Farma Chatbot] Erro Groq:", errorText);
      return res.status(502).json({ error: "Erro de limite de uso da IA no momento. Tente novamente em 1 minuto." });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Desculpe, não consegui formular uma resposta agora.";

    return res.status(200).json({ reply });
  } catch (e) {
    console.error("[Smart Farma Chatbot] Falha interna:", e);
    return res.status(500).json({ error: "Falha interna no servidor." });
  }
}