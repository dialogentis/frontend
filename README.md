# Dialogentis · frontend

Кабинет на React, TypeScript и Vite. API обслуживает авторизацию, рабочие пространства, редактор сценариев, обучение, тестовый чат, публикации, каналы, историю, аналитику и аудит.

## Запуск

Поместите репозитории `frontend` и `backend` рядом и запустите сервисы по инструкции в [backend/README.md](../backend/README.md). Кабинет с API доступен на http://localhost:18080; письма локальной среды — в Mailpit на http://localhost:18025.

Для production используйте HTTPS и конфигурацию из [инструкции backend](../backend/README.md#production).

Для разработки интерфейса нужен Node.js 24:

```sh
npm ci
npm run dev
```

Vite доступен на http://127.0.0.1:5178, запросы `/api` направляются на backend `127.0.0.1:18000`. Адрес API можно изменить переменной `API_PROXY_TARGET`. Для проверки ссылок из писем `PUBLIC_BASE_URL` backend должен совпадать с адресом кабинета.

## Проверки

```sh
npm run typecheck
npm run test:unit
npm run build
npm run api:generate
```

Типы клиента генерируются из `../backend/openapi.json`. Браузерная проверка использует отдельный Chrome/Chromium и Mailpit. Из каталога backend можно поднять изолированный стенд:

```sh
PUBLIC_BASE_URL=http://localhost:18180 docker compose -p dialogentis-browser -f compose.yaml -f compose.browser-test.yaml --profile dev up --build -d frontend mailer mailpit dispatcher worker training-worker maintenance-worker scheduler runtime-watchdog
```

Затем из frontend выполните `CHROME_PATH=/absolute/path/to/chromium npm run test:smoke`. Для проверки клавиатурного сворачивания панели и графа из 300 блоков и 600 связей добавьте `GRAPH_ONLY=1`. Режим `RELEASE_ONLY=1` проходит публикацию, виджет, внешний API и историю. Для другого стенда адреса задаются `BASE_URL` и `MAILPIT_URL`. Тесты регистрируют пользователей и создают пространства на тестовом стенде. После проверки выполните из backend:

```sh
docker compose -p dialogentis-browser -f compose.yaml -f compose.browser-test.yaml --profile dev down -v
```

Требования и журнал этапов находятся в `../backend/docs`.
