# Dialogentis · frontend

Кабинет на React, TypeScript и Vite. Авторизация, подтверждение почты, восстановление пароля, создание и выбор рабочего пространства и принятие приглашения подключены к API. Управление участниками и агентами ещё разрабатывается; исходники прежнего дизайн-прототипа сохранены для следующих этапов и не подключены к рабочему кабинету.

## Запуск

Поместите репозитории `frontend` и `backend` рядом и запустите сервисы по инструкции в [backend/README.md](../backend/README.md). Кабинет с API доступен на http://localhost:18080; письма локальной среды — в Mailpit на http://localhost:18025.

Для разработки интерфейса нужен Node.js 24:

```sh
npm ci
npm run dev
```

Vite доступен на http://127.0.0.1:5178, запросы `/api` направляются на backend `127.0.0.1:18000`. Адрес API можно изменить переменной `API_PROXY_TARGET`. Для проверки ссылок из писем `PUBLIC_BASE_URL` backend должен совпадать с адресом кабинета.

## Проверки

```sh
npm run typecheck
npm run build
npm run api:generate
```

Типы клиента генерируются из `../backend/openapi.json`. Браузерная проверка использует отдельный Chrome/Chromium и Mailpit. Из каталога backend можно поднять изолированный стенд:

```sh
PUBLIC_BASE_URL=http://localhost:18180 docker compose -p dialogentis-browser -f compose.yaml -f compose.browser-test.yaml --profile dev up --build -d frontend mailer mailpit
```

Затем из frontend выполнить `CHROME_PATH=/absolute/path/to/chromium npm run test:smoke`. Для другого стенда адреса задаются `BASE_URL` и `MAILPIT_URL`. Тест регистрирует нового пользователя и создаёт пространство; используйте только тестовую среду. После проверки из backend удалите контейнеры и данные именно тестового проекта:

```sh
docker compose -p dialogentis-browser -f compose.yaml -f compose.browser-test.yaml --profile dev down -v
```

Требования и журнал этапов находятся в `../backend/docs`.
