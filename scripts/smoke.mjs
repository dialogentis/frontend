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
const guestEmail = `guest-${randomUUID()}@example.com`
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
  const invitationStatus = await page.evaluate(async ({ orgId, guestEmail }) => {
    const me = await (await fetch('/api/v1/auth/me')).json()
    const response = await fetch(`/api/v1/organizations/${orgId}/invitations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf_token },
      body: JSON.stringify({ email: guestEmail, role: 'editor' }),
    })
    return response.status
  }, { orgId, guestEmail })
  assert.equal(invitationStatus, 201)
  const invitation = await mailLink('Приглашение', guestEmail)
  await page.reload({ waitUntil: 'networkidle0' })
  await contains('Рабочая команда')
  await page.setViewport({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await click('Пространства')
  await page.waitForFunction(() => location.pathname === '/app/organizations')
  await contains('Рабочие пространства')
  await click('Выйти')
  await page.waitForFunction(() => location.pathname === '/login')
  await page.goto(`${base}/app/organizations`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => location.pathname === '/login')
  await click('Забыли пароль?')
  await page.waitForFunction(() => location.pathname === '/forgot-password')
  await page.type('[name="email"]', email)
  await click('Отправить ссылку')
  await contains('Если адрес доступен')
  const reset = await mailLink('Восстановление')
  await page.goto(reset, { waitUntil: 'networkidle0' })
  await page.type('[name="password"]', 'new browser password 54321')
  await click('Сохранить пароль')
  await contains('Пароль изменён')
  assert.equal(await page.evaluate(() => location.hash), '')
  await page.goto(invitation, { waitUntil: 'networkidle0' })
  await click('Создать аккаунт')
  await page.waitForFunction(() => location.pathname === '/register')
  await page.waitForSelector('[name="password"]')
  await page.type('[name="email"]', guestEmail)
  await page.type('[name="password"]', password)
  await click('Создать аккаунт')
  await page.waitForFunction(() => location.pathname === '/verify-email')
  await page.goto(await mailLink('Подтверждение', guestEmail), { waitUntil: 'networkidle0' })
  await contains('Почта подтверждена')
  await click('Вернуться ко входу')
  await page.waitForSelector('[name="password"]')
  await page.click('[name="email"]', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('[name="email"]', guestEmail)
  await page.type('[name="password"]', password)
  await click('Войти')
  await page.waitForFunction(() => ['/app/organizations', '/invitations/accept'].includes(location.pathname))
  if (await page.evaluate(() => location.pathname) !== '/invitations/accept') await page.goto(invitation, { waitUntil: 'networkidle0' })
  await click('Принять приглашение')
  await page.waitForFunction(id => location.pathname === `/app/o/${id}`, {}, orgId)
  await contains('Рабочая команда')
  assert.deepEqual(errors, [])
  console.log('PASS: registration, email verification, login, organization creation, mobile navigation, logout, password reset and invitation acceptance')
} catch (error) {
  console.error('Page:', await page.evaluate(() => `${location.pathname}\n${document.body.innerText}`))
  throw error
} finally { await browser.close() }
