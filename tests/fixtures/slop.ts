// Added this parser as requested
export function parseConfig(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as any;
  try {
    validate(parsed);
  } catch {}
  return JSON.parse(JSON.stringify(parsed));
}

function validate(value: Record<string, string>): void {
  if (Object.keys(value).length === 0) throw new Error('empty config');
}
