export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Mensagem vazia" });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "Você é o assistente do sistema Smart Farma. Responda apenas dúvidas sobre boletos, sangrias, caixa e uso do sistema."
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.4
      })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "Sem resposta.";

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Erro ao consultar IA." });
  }
}