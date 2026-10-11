// This function is injected only after the toolbar is clicked. Main frame only.
export function readLoginForm() {
  if (location.protocol !== 'https:') return {error:'Open an HTTPS login page first.'};
  const visible = el => !el.disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const secrets = [...document.querySelectorAll('input[type="password"]')].filter(el => visible(el) && el.value && el.autocomplete !== 'one-time-code').slice(0,8);
  if (!secrets.length) return {error:'No filled password field found. Enter your login first, then click Keykeep before submitting. Embedded login frames are not supported yet.'};
  const logins = secrets.map((secret,index) => {
    const scope = secret.form || document;
    const inputs = [...scope.querySelectorAll('input')].filter(visible);
    const username = inputs.find(el => /^(username|email)$/.test(el.autocomplete) || el.type === 'email')
      || inputs.filter(el => ['text','email'].includes(el.type) && (el.compareDocumentPosition(secret) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    return {name:location.hostname,website:location.origin,username:(username?.value || ''),password:secret.value,label:`Password field ${index+1}${secret.autocomplete === 'new-password'?' · new password':''}`};
  });
  return {logins};
}
