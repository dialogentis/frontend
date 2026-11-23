import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'

async function site(body) {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width, initial-scale=1">${body(request.url)}</html>`)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => {
      server.close(resolve)
      server.closeAllConnections()
    }),
  }
}

export async function verifyWidget(browser, cabinet, click) {
  let embed = ''
  const allowed = await site(() => embed)
  const forbidden = await site(path => path === '/sibling'
    ? `<script>parent.postMessage({type:'dialogentis:layout',open:true,position:'bottom-right'},${JSON.stringify(allowed.origin)})</script>`
    : embed)
  let visitor
  try {
    await click('Настроить виджет')
    await cabinet.$eval('[name="widget_origins"]', input => input.select())
    await cabinet.type('[name="widget_origins"]', allowed.origin)
    await click('Сохранить виджет')
    await cabinet.waitForFunction(origin => document.querySelector('.widget-channel-row').textContent.includes(origin), {}, allowed.origin)
    await click('Код вставки')
    await cabinet.waitForSelector('.widget-embed pre')
    embed = await cabinet.$eval('.widget-embed pre', code => code.textContent)
    assert.match(embed, /^<script async src="https?:\/\/[^"]+\/widget-loader\.js" data-dialogentis-widget="[a-f0-9-]{36}"><\/script>$/)

    visitor = await browser.newPage()
    visitor.setDefaultTimeout(10_000)
    await visitor.bringToFront()
    await visitor.setViewport({ width: 320, height: 600, isMobile: true, hasTouch: true })
    await visitor.goto(allowed.origin, { waitUntil: 'networkidle0' })
    const frameSelector = 'iframe[title="Чат поддержки"]'
    await visitor.waitForSelector(frameSelector, { visible: true })
    const widget = await (await visitor.$(frameSelector)).contentFrame()
    assert.ok(widget)
    await widget.waitForSelector('#open-chat', { visible: true })
    await visitor.evaluate(async origin => {
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => {
          window.removeEventListener('message', listener)
          reject(new Error('Sibling message did not arrive'))
        }, 3000)
        function listener(event) {
          if (event.origin !== origin || event.data?.type !== 'dialogentis:layout') return
          clearTimeout(deadline)
          window.removeEventListener('message', listener)
          resolve()
        }
        window.addEventListener('message', listener)
        const sibling = document.createElement('iframe')
        sibling.hidden = true
        sibling.src = `${origin}/sibling`
        document.body.append(sibling)
      })
    }, forbidden.origin)
    assert.equal(await visitor.$eval(frameSelector, frame => frame.style.width), '64px')
    assert.equal(await visitor.$eval(frameSelector, frame => frame.style.left), '8px')
    await widget.focus('#open-chat')
    await visitor.keyboard.press('Enter')
    await widget.waitForSelector('#chat:not([hidden])')
    try {
      await widget.waitForSelector('#composer:not([hidden])')
    } catch (error) {
      console.error('Widget status:', await widget.$eval('#status', status => status.textContent))
      throw error
    }
    const bounds = await (await visitor.$(frameSelector)).boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320)
    assert.match(await widget.$eval('#welcome', message => message.textContent), /Задайте вопрос о доставке/)
    const before = await widget.evaluate(() => {
      const original = window.fetch.bind(window)
      let dropped = false
      window.fetch = async (url, options) => {
        const response = await original(url, options)
        if (String(url).includes('/widget/conversations/') && response.ok) {
          const result = await response.clone().json()
          window.__widgetTokenRenewed = typeof result.session_token === 'string'
            && options.headers.Authorization !== `Bearer ${result.session_token}`
          if (!dropped) {
            dropped = true
            throw new TypeError('Simulated lost response')
          }
        }
        return response
      }
      return document.querySelectorAll('.message-agent').length
    })
    await widget.type('#message', 'Абракадабра <b>текст</b>')
    assert.equal(await widget.$eval('#message', input => input.value), 'Абракадабра <b>текст</b>')
    await widget.click('#composer button')
    await widget.waitForSelector('.message-user')
    await widget.waitForSelector('#retry:not([hidden])')
    await widget.click('#retry')
    await widget.waitForFunction(count => document.querySelectorAll('.message-agent').length > count, {}, before)
    assert.equal(await widget.$$eval('.message-user', items => items.length), 1)
    assert.equal(await widget.$('.message-user b'), null)
    assert.equal(await widget.evaluate(() => window.__widgetTokenRenewed), true)
    await widget.type('#message', 'Узнать статус заказа 0')
    await widget.click('#composer button')
    await widget.waitForSelector('#restart:not([hidden])')
    await widget.waitForFunction(() => document.activeElement.id === 'restart')
    await visitor.keyboard.press('Escape')
    await widget.waitForSelector('#open-chat:not([hidden])')
    await widget.waitForFunction(() => document.activeElement.id === 'open-chat')

    const frameResponse = await fetch(widget.url())
    assert.ok(frameResponse.headers.get('content-security-policy').endsWith(`frame-ancestors ${allowed.origin}`))
    const consoleErrors = []
    const blockedRequests = []
    visitor.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    visitor.on('requestfailed', request => {
      if (request.url().includes('/widget/channels/')) blockedRequests.push(request.failure()?.errorText)
    })
    await visitor.goto(forbidden.origin, { waitUntil: 'networkidle0' })
    assert.equal(await visitor.$eval(frameSelector, frame => frame.style.visibility), 'hidden')
    const blockedFrame = await (await visitor.$(frameSelector)).contentFrame()
    assert.ok(
      consoleErrors.some(message => message.includes('frame-ancestors'))
      || blockedRequests.some(reason => reason?.includes('ERR_BLOCKED_BY_RESPONSE'))
      || blockedFrame?.url().startsWith('chrome-error://'),
      'Expected the forbidden iframe to be rejected by Chromium',
    )
    console.log('PASS: widget retries once, renews its token, focuses restart, and blocks a foreign frame')
  } finally {
    if (visitor) await visitor.close()
    await Promise.all([allowed.close(), forbidden.close()])
  }
}
