const labels: Record<string, string> = {
  POSITIVE: "Positiva", NEUTRAL: "Neutral", CRITICISM: "Crítica", COMPLAINT: "Reclamo",
  ALLEGATION: "Alegación", DENUNCIA: "Denuncia", SCANDAL: "Escándalo",
  OTHER_RELEVANT: "Otra mención relevante", IRRELEVANT: "No relevante",
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta",
};
export const spanishLabel = (value: string | null) => value ? labels[value] ?? value : "Sin clasificar";
