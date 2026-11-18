(() => {
  const script = document.currentScript
  const channel = script?.dataset.dialogentisWidget
  if (!script || !channel || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(channel)
    || !/^https?:$/.test(location.protocol)) return

  const origin = new URL(script.src).origin
  const frame = document.createElement('iframe')
  frame.title = 'Чат поддержки'
  frame.referrerPolicy = 'no-referrer'
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox')
  Object.assign(frame.style, {
    position: 'fixed', right: '8px', bottom: '8px', width: '64px', height: '64px',
    maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', border: '0',
    colorScheme: 'normal', background: 'transparent', zIndex: '2147483000', visibility: 'hidden',
  })

  function receive(event) {
    if (event.origin !== origin || event.source !== frame.contentWindow) return
    const data = event.data
    if (data?.type === 'dialogentis:ready') {
      frame.contentWindow.postMessage({ type: 'dialogentis:init' }, origin)
    } else if (data?.type === 'dialogentis:layout' && typeof data.open === 'boolean') {
      if (data.position !== 'bottom-left' && data.position !== 'bottom-right') return
      const left = data.position === 'bottom-left'
      frame.style.left = left ? '8px' : 'auto'
      frame.style.right = left ? 'auto' : '8px'
      frame.style.width = data.open ? '360px' : '64px'
      frame.style.height = data.open ? '520px' : '64px'
      frame.style.visibility = 'visible'
    }
  }

  window.addEventListener('message', receive)
  frame.src = `${origin}/api/v1/widget/channels/${channel}/frame#${encodeURIComponent(location.origin)}`
  const container = document.body || document.documentElement
  container.append(frame)
})()
