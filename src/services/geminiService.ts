import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getQuantumAdvice(history: number[], currentSignal: number | null, strategy: string | null) {
  const historyStr = history.join(", ");
  const signalStr = currentSignal !== null ? `TERM ${currentSignal}` : "Nenhum sinal ativo";
  
  const prompt = `
    Histórico Recente: [${historyStr}]
    Sinal Atual: ${signalStr}
    Estratégia Identificada: ${strategy || "Nenhuma"}

    Como uma inteligência artificial Quantum Cortex v4.0, analise brevemente este cenário. 
    Use uma linguagem técnica, focada em probabilidades, fluxos terminais e mecânica quântica de padrões.
    Seja conciso (máximo 3 frases). Trate os dados como "ondas de probabilidade" ou "convergência de terminais".
    Se houver um sinal, justifique por que ele faz sentido no contexto do "caos determinístico".
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "Você é o núcleo de processamento do Quantum Cortex v4.0. Sua linguagem é técnica, fria e focada em dados quânticos e probabilidades complexas. Você nunca dá garantias, mas fala sobre convergência de padrões.",
      },
    });

    return response.text || "Erro na sincronização neural com o Cortex.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Conexão com o Cortex interrompida. Verifique o uplink neural.";
  }
}
