const status = document.getElementById('offline-status');
let installPrompt;
window.addEventListener('beforeinstallprompt',event => {
  event.preventDefault(); installPrompt = event;
  document.getElementById('install-app').hidden = false;
});
document.getElementById('install-app').onclick = async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null; document.getElementById('install-app').hidden = true;
};
window.addEventListener('appinstalled',() => {
  installPrompt = null; document.getElementById('install-app').hidden = true;
});
if ('serviceWorker' in navigator) {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js?access=1');
    await navigator.serviceWorker.ready;
    status.textContent = 'Opening requires sign-in. An open vault can save offline.';
    const update = () => { if (registration.waiting) status.textContent = 'Update ready. Close every Keykeep window, then reopen to use it.'; };
    update();
    registration.addEventListener('updatefound',() => {
      registration.installing?.addEventListener('statechange',update);
    });
  } catch { status.textContent = 'App installation unavailable in this browser.'; }
} else status.textContent = 'Offline access is unavailable in this browser.';
