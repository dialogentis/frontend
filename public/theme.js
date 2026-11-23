try {
  const mode = localStorage.getItem('dialogentis-mode')
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.mode = mode
} catch {
  // The browser can deny access to preferences.
}
