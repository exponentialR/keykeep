// Store only the origin: URL paths, credentials and query strings can contain secrets.
export function websiteOrigin(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid HTTPS website address.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a full website address, starting with https://.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS website address without embedded credentials.');
  return url.origin;
}
export function appAddress(value) {
  const origin = websiteOrigin(value);
  if (!origin) throw new Error('Enter your Keykeep app address.');
  const url = new URL(value);
  if (!['/', '/app', '/app/'].includes(url.pathname) || url.search || url.hash) throw new Error('Use your Keykeep address ending in /app.');
  return origin + '/app';
}
export function checkedLogin(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid login.');
  for (const [field,limit] of [['name',150],['username',250],['password',4096]]) {
    if (typeof value[field] !== 'string' || value[field].length > limit) throw new Error('This login is too large or incomplete.');
  }
  const website = websiteOrigin(value.website);
  if (!website || !value.name.trim() || !value.password) throw new Error('Enter a name, website and password.');
  return {name:value.name.trim(),username:value.username.trim(),password:value.password,website};
}
export function matchingLogins(entries, login) {
  return entries.filter(entry => !entry.deletedAt && entry.website === login.website && entry.username === login.username);
}
export function captureNonce(hash) {
  return /^#keykeep-save=([a-f0-9-]{36})$/.exec(hash || '')?.[1] || null;
}
