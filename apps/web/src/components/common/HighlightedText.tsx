/** React escapes every fragment: neither entity names nor AI output are HTML. */
export default function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const alternatives = [...new Set(terms.map(t => t.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!alternatives.length) return <>{text}</>;
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_])(${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  return <>{text.split(expression).map((part, index) => index % 2
    ? <strong key={index} className="font-bold text-red-700 dark:text-red-400">{part}</strong>
    : part)}</>;
}
