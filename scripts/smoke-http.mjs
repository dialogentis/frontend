import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL || 'http://localhost:18180'
const mailbox = process.env.MAILPIT_URL || 'http://localhost:18125'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true })
const errors = []
const page = await browser.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', error => errors.push(error.message))
const email = `browser-${randomUUID()}@example.com`
const password = 'browser password 12345'
const click = async text => {
  for (const element of await page.$$('button, a')) {
    if ((await element.evaluate(e => e.textContent)).trim() === text) { await element.click(); return }
  }
  throw new Error(`Missing action: ${text}`)
}
const contains = text => page.waitForFunction(value => document.body.innerText.includes(value), {}, text)
const mailLink = async (subject, recipient = email) => {
  for (let i = 0; i < 100; i++) {
    const data = await (await fetch(`${mailbox}/api/v1/messages?limit=200`)).json()
    const message = (data.messages || []).find(m => m.Subject.includes(subject) && m.To.some(r => r.Address === recipient))
    if (message) {
      const details = await (await fetch(`${mailbox}/api/v1/message/${message.ID}`)).json()
      const match = details.Text.match(/https?:\/\/[^\s]+#token=[A-Za-z0-9_-]+/)
      assert.ok(match)
      return match[0]
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Email was not delivered')
}
try {
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(`${base}/app/organizations`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => location.pathname === '/login')
  await click('Зарегистрироваться')
  await page.waitForSelector('[name="password"][autocomplete="new-password"]', { visible: true })
  await page.type('[name="email"]', email)
  await page.type('[name="password"]', password)
  await click('Создать аккаунт')
  await page.waitForFunction(() => location.pathname === '/verify-email')
  const confirmation = await mailLink('Подтверждение')
  await page.goto(confirmation, { waitUntil: 'networkidle0' })
  await contains('Почта подтверждена')
  assert.equal(await page.evaluate(() => location.hash), '')
  await click('Вернуться ко входу')
  await page.waitForFunction(() => location.pathname === '/login')
  await page.waitForSelector('[name="password"]')
  await page.click('[name="email"]', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('[name="email"]', email)
  await page.type('[name="password"]', password)
  await click('Войти')
  await page.waitForFunction(() => location.pathname === '/app/organizations')
  await contains('Здесь пока нет пространств')
  await click('Создать пространство')
  await page.type('[name="name"]', 'Рабочая команда')
  await page.type('[name="slug"]', `team-${randomUUID()}`)
  await click('Создать')
  await page.waitForFunction(() => location.pathname.startsWith('/app/o/'))
  await contains('Рабочая команда')
  const orgId = await page.evaluate(() => location.pathname.split('/').at(-1))
  await click('Создать агента')
  await page.type('[name="agent_name"]', 'Помощник')
  await page.type('[name="agent_slug"]', 'assistant')
  await page.type('[name="agent_description"]', 'Поддержка клиентов')
  await click('Создать')
  await contains('Поддержка клиентов')
  await page.reload({ waitUntil: 'networkidle0' })
  await contains('Помощник')
  await page.click('[aria-label="Изменить Помощник"]')
  await page.$eval('[name="agent_name"]', input => input.select())
  await page.keyboard.press('Backspace')
  await page.type('[name="agent_name"]', 'Консультант')
  await click('Сохранить')
  await page.waitForSelector('[aria-label="В архив Консультант"]')
  await click('Консультант')
  await page.waitForFunction(() => location.pathname.includes('/agents/'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Начать редактирование'))
  await click('Начать редактирование')
  await contains('Сохранено')
  await click('Параметры')
  await click('Добавить параметр')
  await page.$eval('[name="slot_name"]', input => input.select())
  await page.type('[name="slot_name"]', 'Сумма заказа')
  await page.$eval('[name="slot_code"]', input => input.select())
  await page.type('[name="slot_code"]', 'amount')
  await page.select('[name="slot_type"]', 'number')
  await page.$$eval('label', labels => labels.find(label => label.textContent.includes('Чувствительное значение')).querySelector('input').click())
  await page.$$eval('label', labels => labels.find(label => label.textContent.includes('Задать значение по умолчанию')).querySelector('input').click())
  await page.$eval('[name="slot_default"]', input => input.select())
  await page.type('[name="slot_default"]', '100.25')
  await page.waitForFunction(async () => { const p = location.pathname.split('/'); const d = (await (await fetch(`/api/v1/organizations/${p[3]}/agents/${p[5]}/draft`)).json()).config; return d.slots.some(slot => slot.code === 'amount' && slot.default === '100.25' && slot.sensitive) }, { timeout: 10000 })
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(status => status.textContent === 'Сохранено'))
  const sourceSlotId = await page.evaluate(async () => { const p = location.pathname.split('/'); const d = (await (await fetch(`/api/v1/organizations/${p[3]}/agents/${p[5]}/draft`)).json()).config; return d.slots.find(slot => slot.code === 'amount').id })

  const integrationId = await page.evaluate(async org => {
    const csrf = (await (await fetch('/api/v1/auth/me')).json()).csrf_token
    const response = await fetch(`/api/v1/organizations/${org}/integrations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ name: 'Orders', base_url: 'https://orders.example.com', methods: ['GET', 'POST'], paths: ['/orders/'], response_fields: ['order.amount'] }) })
    if (!response.ok) throw new Error(`Integration create: ${response.status}`)
    return (await response.json()).id
  }, orgId)
  await click('Сценарий')
  await click('Добавить HTTP-запрос')
  await page.waitForSelector('.react-flow__node-httpAction')
  await page.$eval('.react-flow__node-httpAction', node => node.click())
  await page.waitForFunction(id => [...document.querySelector('[name="http_integration"]').options].some(option => option.value === id), {}, integrationId)
  await page.select('[name="http_integration"]', integrationId)
  await page.select('[name="http_method"]', 'POST')
  await page.type('[name="http_path"]', '/orders/123')
  await page.$eval('[name="http_mock_response"]', input => { input.focus(); input.select() })
  await page.type('[name="http_mock_response"]', '{"order":{"amount":"12.5"}}')
  await click('Применить ответ')
  await page.$$eval('.http-mapping', (sections, slotId) => {
    const section = [...sections].find(item => item.querySelector('h3').textContent === 'Поля ответа')
    const [field, slot] = section.querySelectorAll('select')
    field.value = 'order.amount'; field.dispatchEvent(new Event('change', { bubbles: true }))
    slot.value = slotId; slot.dispatchEvent(new Event('change', { bubbles: true }))
  }, sourceSlotId)
  await page.$$eval('.http-mapping', sections => [...sections].find(item => item.querySelector('h3').textContent === 'Поля ответа').querySelector('button').click())
  await page.waitForFunction(async ({ integrationId, slotId }) => { const p = location.pathname.split('/'); const data = await (await fetch(`/api/v1/organizations/${p[3]}/agents/${p[5]}/draft`)).json(); const action = data.config.flow.nodes.find(item => item.type === 'http_action'); return action?.config.integration_id === integrationId && action.config.method === 'POST' && action.config.path === '/orders/123' && action.config.response_mapping?.['order.amount'] === slotId && action.config.mock_response?.order?.amount === '12.5' }, { timeout: 15000 }, { integrationId, slotId: sourceSlotId })
  const endId = await page.$eval('[aria-label="Переход: Успешно"]', select => [...select.options].find(option => option.textContent.startsWith('Завершение ·')).value)
  for (const label of ['Успешно', 'Ошибка запроса', 'Время истекло', 'Некорректный ответ', 'Результат неизвестен']) await page.select(`[aria-label="Переход: ${label}"]`, endId)
  await page.waitForFunction(async () => { const p = location.pathname.split('/'); const data = await (await fetch(`/api/v1/organizations/${p[3]}/agents/${p[5]}/draft`)).json(); const action = data.config.flow.nodes.find(item => item.type === 'http_action'); return data.config.flow.edges.filter(edge => edge.source === action?.id).length === 5 }, { timeout: 15000 })
  if (process.env.HTTP_SCREENSHOT_PATH) await page.screenshot({ path: process.env.HTTP_SCREENSHOT_PATH })
  assert.deepEqual(errors, [])
  console.log('PASS: HTTP inspector saved integration, path, mapping and mock response')
} finally {
  await browser.close()
}
