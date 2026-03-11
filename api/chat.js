export default async function handler(req, res) {
  // CONFIGURAÇÃO DE CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem vazia" });
    }

    // PROMPT COMPRIMIDO E OTIMIZADO PARA NÃO ESTOURAR O LIMITE DE TOKENS (TPM)
    const systemPrompt = `Você é o Assistente Smart Farma, criado por Diego.
Regra de Ouro: Apenas oriente sobre o uso do Smart Farma. Nunca diga que executou ações (você não altera dados). Responda de forma curta, direta e em PT-BR. Se o assunto não for o sistema, recuse educadamente.

CONCEITOS DO SISTEMA:
1. ACESSOS: Vendedor (Loja) e Admin (Escritório). Login é numérico. Novos acessos passam por aprovação do Admin. Existe recuperação local de senha via validação do Admin.
2. SANGRIA: Dinheiro do caixa enviado ao escritório. Status: pendente (aguarda), aprovada (aceita), recusada (devolvida com motivo), modificada (valor ajustado).
3. DESPESA: Dinheiro retirado do caixa da loja para gastos. Diminui o saldo.
4. BOLETOS (Vendedor): Abas "Conferir Novos" e "A Pagar/Pagos". Pode confirmar recebimento ou relatar erro (devolve ao admin). 
5. STATUS DE BOLETOS: pendente (novo/aguardando), confirmado (loja ciente), analise_pagamento (loja pagou, aguarda admin baixar), pago (baixado), recusado (erro). O vendedor pode informar o pagamento exato ou com diferença (juros/desconto).
6. FOLHA DE CONFERÊNCIA (Caixa Loja): Cálculo = saldoAnterior + totalSangrias - totalBoletos + pixRecebido - despesaValor. Esta folha atualiza o saldo físico (saldoDinheiro) da loja. Boletos pendentes selecionados na folha exigem informar valor pago (vão para analise_pagamento). Se a loja não tem saldo inicial, um modal pede o valor físico total no momento.
7. ADMIN (Escritório): 
- Caixa do Escritório: Independente das lojas. Pode adicionar/retirar fundos.
- Lançar Boletos: Lança em fila/lote -> Revisa (pode editar/excluir) -> Envia às lojas (status pendente).
- Conferência de Caixas: Audita folhas das lojas (marca itens certo/errado). Atualiza status: certo=aprovado/pago, errado=recusado/analise_pagamento.
- Dashboard: Vê grids de lojas (físico, em trânsito, boletos pendentes) e tem feed de movimentações.`;

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
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Smart Farma Chatbot] Erro Groq:", errorText);
      return res.status(502).json({ error: "Erro de Rate Limit ou IA indisponível." });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Sem resposta.";

    return res.status(200).json({ reply });
  } catch (e) {
    console.error("[Smart Farma Chatbot] Falha interna:", e);
    return res.status(500).json({ error: "Falha interna no servidor." });
  }
}