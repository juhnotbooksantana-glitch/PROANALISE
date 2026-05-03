export const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  "ELITE 2X (Gatilho T4/T5 -> Alvo T2)": "Gatilho: Saída de números terminados em 4 ou 5. Lógica: Alta probabilidade de retorno ao Terminal 2 (2, 12, 22, 32) na sequência imediata.",
  "QUARTA DIMENSÃO (Gatilho T1/T3 -> Alvo T4)": "Gatilho: Saída de números terminados em 1 ou 3. Lógica: Padrão de deslocamento para o Terminal 4 (4, 14, 24, 34).",
  "FÓRMULA 5X (Gatilho T6/T8 -> Alvo T5)": "Gatilho: Saída de números terminados em 6 ou 8. Lógica: Convergência estatística para o Terminal 5 (5, 15, 25, 35).",
  "ALPHA 6 (Gatilho T2/T9 -> Alvo T6)": "Gatilho: Saída de números terminados em 2 ou 9. Lógica: Mapeamento de vizinhos aponta para o Terminal 6 (6, 16, 26, 36).",
  "PADRÃO BLACK (Repetição com Vizinhos)": "Gatilho: Saída de 13, 31 ou 33. Lógica: Padrão 'Black' indica repetição cíclica do mesmo terminal com proteção de vizinhos.",
  "REPETIÇÃO QUÂNTICA": "Gatilho: Duas ocorrências do mesmo terminal nas últimas 4 entradas. Lógica: O algoritmo detecta uma 'memória de terminal' e sugere a repetição para fechamento de ciclo."
};
