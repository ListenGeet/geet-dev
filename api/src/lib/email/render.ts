import { templates } from './templates.generated';

export type TemplateName = keyof typeof templates;
export type Sender = 'security' | 'hello' | 'marketing' | 'copyright' | 'alerts';

export interface Rendered {
  subject: string;
  html: string;
  text: string;
  sender: Sender;
}

/** Values that are trusted admin-authored HTML. Everything else is escaped (docs/20 §9). */
const RAW_KEYS = new Set(['body_html']);
const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fill(source: string, vars: Record<string, string>, escape: boolean, name: string): string {
  return source.replace(PLACEHOLDER, (_m, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`Template ${name} needs "${key}"`);
    return escape && !RAW_KEYS.has(key) ? escapeHtml(value) : value;
  });
}

/** Fills `{{name}}` placeholders in the HTML and plain-text parts. Both are always produced. */
export function render(name: TemplateName, vars: Record<string, string>): Rendered {
  const t = templates[name];
  if (!t) throw new Error(`Unknown template ${String(name)}`);
  return {
    // Header values must never carry a line break.
    subject: fill(t.subject, vars, false, name)
      .replace(/[\r\n]+/g, ' ')
      .trim(),
    html: fill(t.html, vars, true, name),
    text: fill(t.text, vars, false, name),
    sender: t.from as Sender,
  };
}
