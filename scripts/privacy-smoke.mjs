import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL || 'http://localhost:18180'
const mailbox = process.env.MAILPIT_URL || 'http://localhost:18125'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true })
const page = await browser.newPage()
const email = `privacy-${randomUUID()}@example.com`
const password = 'browser password 12345'
const click = async text => {
  for (const element of await page.$$('button, a')) {
    if ((await element.evaluate(e => e.textContent)).trim() === text) { await element.click(); return }
  }
  throw new Error(`Missing action: ${text}`)
}
const contains = text => page.waitForFunction(value => document.body.innerText.includes(value), {}, text)

try {
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(`${base}/register`, { waitUntil: 'networkidle0' })
  await page.type('[name="email"]', email)
  await page.type('[name="password"]', password)
  await click('Создать аккаунт')
  await page.waitForFunction(() => location.pathname === '/verify-email')
  let link
  for (let i = 0; i < 100 && !link; i++) {
    const data = await (await fetch(`${mailbox}/api/v1/messages?limit=200`)).json()
    const message = data.messages?.find(item => item.Subject.includes('Подтверждение') && item.To.some(to => to.Address === email))
    if (message) {
      const details = await (await fetch(`${mailbox}/api/v1/message/${message.ID}`)).json()
      link = details.Text.match(/https?:\/\/[^\s]+#token=[A-Za-z0-9_-]+/)?.[0]
    }
    if (!link) await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(link)
  await page.goto(link, { waitUntil: 'networkidle0' })
  await contains('Почта подтверждена')
  await click('Вернуться ко входу')
  await page.waitForSelector('[name="password"]')
  await page.type('[name="email"]', email)
  await page.type('[name="password"]', password)
  await click('Войти')
  await page.waitForFunction(() => location.pathname === '/app/organizations')
  await click('Создать пространство')
  await page.type('[name="name"]', 'Проверка хранения')
  await page.type('[name="slug"]', `privacy-${randomUUID()}`)
  await click('Создать')
  await page.waitForFunction(() => location.pathname.startsWith('/app/o/'))
  await click('Настройки')
  await contains('Настройки пространства')
  await page.$eval('.settings-checkbox input', input => input.click())
  assert.equal(await page.$$eval('.settings-checkbox input', inputs => inputs[1].checked), true)
  await click('Сохранить')
  await contains('Настройки сохранены.')
  await page.reload({ waitUntil: 'networkidle0' })
  assert.equal(await page.$eval('.settings-checkbox input', input => input.checked), false)
  assert.equal(await page.$$eval('.settings-checkbox input', inputs => inputs[1].checked), false)
  await page.$eval('.settings-checkbox input', input => input.click())
  await click('Сохранить')
  await contains('Настройки сохранены.')
  await click('Интеграции')
  await contains('Подключения к внешним HTTPS-сервисам.')
  await click('Добавить интеграцию')
  await page.type('.integration-form input:not([type])', 'Сервис заказов')
  await page.type('.integration-form input[type="url"]', 'https://orders.example.com/api')
  await page.type('.integration-form textarea', '/orders/')
  await page.type('.integration-form input[type="password"]', 'private-token')
  await page.$eval('.integration-form', form => form.requestSubmit())
  await contains('Сервис заказов')
  assert.ok(!(await page.evaluate(() => document.body.innerText.includes('private-token'))))
  await click('Сменить секрет')
  await page.type('.integration-form input[type="password"]', 'rotated-token')
  await click('Обновить секрет')
  await page.waitForFunction(() => !document.querySelector('.integration-form'))
  await click('Отключить')
  await contains('Отключена')
  page.once('dialog', dialog => dialog.accept())
  await click('Удалить')
  await contains('Интеграций пока нет')
  console.log('PASS: organization privacy settings and integrations')
} finally { await browser.close() }
