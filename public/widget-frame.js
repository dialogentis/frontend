(() => {
  if (window.parent === window) return
  let parentOrigin
  try {
    parentOrigin = decodeURIComponent(location.hash.slice(1))
    const url = new URL(parentOrigin)
    if (url.origin !== parentOrigin || !/^https?:$/.test(url.protocol)) return
  } catch { return }

  const { channel, position, accent, enabled } = document.body.dataset
  const launcher = document.getElementById('open-chat')
  const close = document.getElementById('close-chat')
  const chat = document.getElementById('chat')
  const status = document.getElementById('status')
  const messages = document.getElementById('messages')
  const composer = document.getElementById('composer')
  const input = document.getElementById('message')
  const retry = document.getElementById('retry')
  const restart = document.getElementById('restart')
  const send = composer.querySelector('button')
  let session
  let pending
  let busy = false
  const rendered = new Set()

  if (/^#[0-9a-f]{6}$/i.test(accent)) document.body.style.setProperty('--accent', accent)

  function layout(open) {
    window.parent.postMessage({ type: 'dialogentis:layout', position, open }, parentOrigin)
    launcher.hidden = open
    launcher.setAttribute('aria-expanded', String(open))
    chat.hidden = !open
  }

  function appendMessage(text, sender) {
    const element = document.createElement('p')
    element.className = `message message-${sender}`
    const label = document.createElement('span')
    label.className = 'sr-only'
    label.textContent = sender === 'user' ? 'Вы. ' : 'Агент. '
    element.append(label)
    let cursor = 0
    for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi)) {
      element.append(text.slice(cursor, match.index))
      try {
        const url = new URL(match[0])
        if (!/^https?:$/.test(url.protocol)) throw new TypeError()
        const link = document.createElement('a')
        link.textContent = match[0]
        link.href = url.href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        element.append(link)
      } catch { element.append(match[0]) }
      cursor = match.index + match[0].length
    }
    element.append(text.slice(cursor))
    messages.append(element)
    messages.scrollTop = messages.scrollHeight
  }

  function showResult(result) {
    for (const message of result.messages) {
      if (!rendered.has(message.id)) {
        rendered.add(message.id)
        appendMessage(message.text, 'agent')
      }
    }
    composer.hidden = result.status !== 'waiting_input'
    restart.hidden = result.status === 'waiting_input'
    if (result.status === 'failed') status.textContent = 'Не удалось продолжить диалог.'
    else if (result.status === 'completed') status.textContent = 'Диалог завершён.'
    else if (result.replayed && !result.replay_available) status.textContent = 'Сообщение обработано.'
    else status.textContent = ''
  }

  async function deliver() {
    if (busy || !pending) return
    const request = pending
    busy = true
    send.disabled = true
    input.disabled = true
    retry.hidden = true
    status.textContent = request.start ? 'Подключаем чат…' : 'Ожидаем ответ…'
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': request.key }
    if (!request.start) headers.Authorization = `Bearer ${session.session_token}`
    const path = request.start
      ? `/api/v1/widget/channels/${channel}/sessions`
      : `/api/v1/widget/conversations/${session.conversation_id}/messages`
    try {
      const response = await fetch(path, {
        method: 'POST', headers, body: JSON.stringify(request.body),
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        if (!request.start && [401, 403, 404, 410].includes(response.status)) {
          status.textContent = 'Сеанс завершён.'
          composer.hidden = true
          restart.hidden = false
          pending = undefined
          return
        }
        if (response.status === 429) status.textContent = 'Слишком много запросов. Повторите через несколько секунд.'
        else status.textContent = request.start ? 'Чат временно недоступен.' : 'Ответ пока не получен.'
        retry.hidden = false
        return
      }
      const result = await response.json()
      if (request.start) session = result
      pending = undefined
      showResult(result)
    } catch {
      status.textContent = 'Соединение прервалось. Попробуйте ещё раз.'
      retry.hidden = false
    } finally {
      busy = false
      input.disabled = !!pending
      send.disabled = !!pending
      if (!composer.hidden && !chat.hidden && !pending) input.focus()
    }
  }

  function start() {
    if (enabled !== 'true') {
      status.textContent = 'Чат временно недоступен.'
      return
    }
    pending = { start: true, key: crypto.randomUUID(), body: { parent_origin: parentOrigin } }
    void deliver()
  }

  launcher.addEventListener('click', () => {
    layout(true)
    if (!session && !pending) start()
    if (!composer.hidden && !busy) input.focus()
    else close.focus()
  })
  close.addEventListener('click', () => { layout(false); launcher.focus() })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !chat.hidden) close.click()
  })
  composer.addEventListener('submit', event => {
    event.preventDefault()
    const text = input.value.trim()
    if (!session || pending || busy || !text) return
    pending = { start: false, key: crypto.randomUUID(), body: { client_message_id: crypto.randomUUID(), text } }
    appendMessage(text, 'user')
    input.value = ''
    void deliver()
  })
  retry.addEventListener('click', () => void deliver())
  restart.addEventListener('click', () => {
    session = undefined
    restart.hidden = true
    messages.querySelectorAll('.message').forEach(message => message.remove())
    rendered.clear()
    start()
  })

  function initialize(event) {
    if (event.source !== window.parent || event.origin !== parentOrigin
      || event.data?.type !== 'dialogentis:init') return
    window.removeEventListener('message', initialize)
    layout(false)
  }
  window.addEventListener('message', initialize)
  window.parent.postMessage({ type: 'dialogentis:ready' }, parentOrigin)
})()
