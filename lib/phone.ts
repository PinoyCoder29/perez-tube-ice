/** Accepts 09XXXXXXXXX or +639XXXXXXXXX (spaces/dashes allowed). Returns canonical 09XXXXXXXXX or null. */
export function normalizePhone(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, '');
  if (/^09\d{9}$/.test(s)) return s;
  if (/^\+639\d{9}$/.test(s)) return '0' + s.slice(3);
  if (/^639\d{9}$/.test(s)) return '0' + s.slice(2);
  return null;
}

/** tel: link using the international format, e.g. tel:+639171234567 */
export function telHref(phone: string): string {
  const n = normalizePhone(phone);
  if (n) return `tel:+63${n.slice(1)}`;
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
