const $ = (id) => document.getElementById(id);
let agents = [],
  selected = null,
  session = null,
  timer = null,
  navigation = 0,
  dirty = false,
  edits = 0,
  demoMode = false;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(url, options = {}) {
  if (demoMode) return demoApi(url, options);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(150000),
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response
    .json()
    .catch(() => ({ detail: `Ошибка сервера (${response.status})` }));
  if (!response.ok) {
    const error = new Error(
      typeof data.detail === "string"
        ? data.detail
        : (data.detail || []).map((e) => e.msg).join("; "),
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
function notify(message, error = false) {
  const el = $("notice");
  el.textContent = message;
  el.className = error ? "error" : "";
  el.hidden = false;
}
async function refresh() {
  agents = await api("/api/agents");
  $("agent-count").textContent = agents.length;
  $("agents").innerHTML = agents
    .map(
      (a) =>
        `<button class="agent-item ${selected?.id === a.id ? "selected" : ""}" data-id="${esc(a.id)}"><span class="agent-symbol" aria-hidden="true">${esc(a.name.charAt(0).toUpperCase())}</span><span class="agent-copy"><span class="agent-name">${esc(a.name)}</span><span class="agent-meta">${demoMode ? "Пример конфигурации" : a.has_model ? "Модель обучена" : "Черновик"}</span></span></button>`,
    )
    .join("");
  document
    .querySelectorAll(".agent-item")
    .forEach((el) => (el.onclick = () => openAgent(el.dataset.id)));
}
function entry(type, data = {}) {
  const el = document.createElement("div");
  el.className = "card entry";
  const header = `<div class="entry-head"><span>${type === "intent" ? "Намерение" : type === "entity" ? "Сущность" : "Правило"}</span><button class="remove" type="button">Удалить ×</button></div>`;
  if (type === "intent")
    el.innerHTML =
      header +
      `<div class="entry-grid"><label>Имя (латиница)<input class="i-name" value="${esc(data.name)}" placeholder="greeting"></label><label>Примеры, по одной фразе в строке<textarea class="i-examples" placeholder="Здравствуйте&#10;Добрый день">${esc((data.examples || []).join("\n"))}</textarea></label></div>`;
  if (type === "entity")
    el.innerHTML =
      header +
      `<div class="entry-grid"><label>Имя (латиница)<input class="e-name" value="${esc(data.name)}" placeholder="order_number"></label><label>Регулярное выражение<input class="e-pattern" value="${esc(data.pattern)}" placeholder="[0-9]+"></label></div>`;
  if (type === "rule")
    el.innerHTML =
      header +
      `<div class="rule-grid"><label>Состояние<input class="r-state" value="${esc(data.state || "start")}"></label><label>Намерение<input class="r-intent" value="${esc(data.intent)}" placeholder="greeting"></label><label>Действие<select class="r-action"><option value="reply">Ответить</option><option value="ask">Запросить данные</option><option value="handoff">Передать агенту</option></select></label><label>Текст ответа<input class="r-text" value="${esc(data.text)}"></label><label>Следующее состояние<input class="r-next" value="${esc(data.next_state || "start")}"></label><label>Целевой агент<select class="r-target"><option value="">Выберите агента</option>${agents
        .filter((a) => a.id !== selected?.id)
        .map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
        .join("")}</select></label></div>`;
  if (type === "rule") {
    el.querySelector(".r-action").value = data.action || "reply";
    el.querySelector(".r-target").value = data.target_agent || "";
    const syncAction = () => {
      const handoff = el.querySelector(".r-action").value === "handoff";
      el.querySelector(".r-target").parentElement.hidden = !handoff;
      el.querySelector(".r-text").parentElement.hidden = handoff;
      el.querySelector(".r-next").parentElement.hidden = handoff;
    };
    el.querySelector(".r-action").addEventListener("change", syncAction);
    syncAction();
  }
  el.querySelector(".remove").onclick = () => {
    dirty = true;
    edits++;
    updateSaveState();
    updateCounts();
    el.remove();
    updateCounts();
  };
  return el;
}
function render(a) {
  document.querySelector(".agent-menu").open = false;
  dirty = false;
  selected = a;
  $("empty").hidden = true;
  $("editor").hidden = false;
  $("notice").hidden = true;
  $("title").textContent = a.name;
  $("crumb").textContent = a.name;
  $("name").value = a.name;
  $("description").value = a.description;
  $("fallback").value = a.config.fallback;
  $("threshold").value = a.config.threshold;
  for (const [key, type] of [
    ["intents", "intent"],
    ["entities", "entity"],
    ["rules", "rule"],
  ]) {
    $(key).replaceChildren(...a.config[key].map((v) => entry(type, v)));
  }
  updateCounts();
  $("agent-description").textContent =
    a.description || "Назначение пока не указано";
  updateSaveState();
  status();
}
function status() {
  if (!selected) return;
  const text = {
    idle: "Модель ещё не обучена",
    running: "Идёт обучение модели",
    ready: "Модель готова",
    failed: "Ошибка обучения",
  };
  $("agent-status").textContent = demoMode
    ? "Просмотр"
    : selected.training === "running"
      ? "Обучение"
      : selected.has_model
        ? selected.stale
          ? "Нужно переобучить"
          : "Модель готова"
        : "Черновик";
  $("model-status").textContent = demoMode
    ? "Подключите сервер для обучения"
    : text[selected.training] || selected.training;
  $("model-detail").textContent = demoMode
    ? "Можно изучить редактор и сохранить примеры в браузере. Реальное обучение станет доступно после подключения API."
    : selected.has_model
      ? selected.stale
        ? "Настройки изменились. Используется последняя обученная модель; запустите переобучение."
        : "Актуальная модель готова к тестированию."
      : "Для обучения необходимо минимум два намерения с примерами.";
  $("train").disabled = demoMode || selected.training === "running";
  $("chat-input").disabled = demoMode || !selected.has_model;
  $("chat-form").querySelector("button").disabled =
    demoMode || !selected.has_model;
  $("chat-help").textContent = demoMode
    ? "Режим просмотра. Для реальных ответов нужен подключённый сервер."
    : !selected.has_model
      ? "Сначала обучите модель на вкладке «Обучение»."
      : "Диалог сохраняется автоматически. «Новый диалог» сбрасывает контекст.";
  $("train-error").hidden = !selected.error;
  $("train-error").textContent = selected.error;
}
async function openAgent(id) {
  if (
    dirty &&
    !confirm("Есть несохранённые изменения. Перейти без сохранения?")
  )
    return;
  const version = ++navigation;
  clearTimeout(timer);
  try {
    const a = await api("/api/agents/" + id);
    if (version !== navigation) return;
    session = localStorage.getItem("session:" + id);
    render(a);
    await refresh();
    if (version !== navigation) return;
    await loadMessages();
    poll();
  } catch (e) {
    if (version === navigation) notify(e.message, true);
  }
}
$("settings").addEventListener("input", () => {
  dirty = true;
  edits++;
  updateSaveState();
  updateCounts();
});
$("settings").addEventListener("change", () => {
  dirty = true;
  edits++;
  updateSaveState();
  updateCounts();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function saveAgent() {
  const id = selected.id,
    version = navigation,
    edit = edits;
  const a = await api("/api/agents/" + id, {
    method: "PUT",
    body: JSON.stringify({
      name: $("name").value,
      description: $("description").value,
      config: config(),
      revision: selected.revision,
      version: selected.version,
    }),
  });
  if (version === navigation) {
    selected = { ...selected, revision: a.revision, version: a.version };
    if (edit === edits) render(a);
    await refresh();
  }
  return a;
}

function config() {
  return {
    intents: [...$("intents").children].map((e) => ({
      name: e.querySelector(".i-name").value.trim(),
      examples: e
        .querySelector(".i-examples")
        .value.split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    })),
    entities: [...$("entities").children].map((e) => ({
      name: e.querySelector(".e-name").value.trim(),
      pattern: e.querySelector(".e-pattern").value,
    })),
    rules: [...$("rules").children].map((e) => ({
      state: e.querySelector(".r-state").value.trim(),
      intent: e.querySelector(".r-intent").value.trim(),
      action: e.querySelector(".r-action").value,
      text: e.querySelector(".r-text").value,
      next_state: e.querySelector(".r-next").value.trim(),
      target_agent: e.querySelector(".r-target").value,
    })),
    fallback: $("fallback").value,
    threshold: Number($("threshold").value),
  };
}
$("new").onclick = async () => {
  if (dirty && !confirm("Перейти без сохранения изменений?")) return;
  dirty = false;
  try {
    const a = await api("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        name: "Новый агент",
        description: "",
        config: {},
      }),
    });
    await refresh();
    await openAgent(a.id);
  } catch (e) {
    alert(e.message);
  }
};
$("save").onclick = async () => {
  try {
    await saveAgent();
    notify(
      demoMode
        ? "Конфигурация сохранена в этом браузере."
        : "Настройки сохранены.",
    );
  } catch (e) {
    notify(e.message, true);
  }
};
$("delete").onclick = async () => {
  if (!confirm("Удалить агента?")) return;
  const id = selected.id,
    version = navigation;
  try {
    await api("/api/agents/" + id, { method: "DELETE" });
    if (version !== navigation) {
      await refresh();
      return;
    }
    navigation++;
    clearTimeout(timer);
    dirty = false;
    selected = null;
    $("editor").hidden = true;
    $("empty").hidden = false;
    await refresh();
  } catch (e) {
    notify(e.message, true);
  }
};
$("add-intent").onclick = () => {
  dirty = true;
  edits++;
  updateSaveState();
  updateCounts();
  $("intents").append(entry("intent"));
  updateCounts();
};
$("add-entity").onclick = () => {
  dirty = true;
  edits++;
  updateSaveState();
  updateCounts();
  $("entities").append(entry("entity"));
  updateCounts();
};
$("add-rule").onclick = () => {
  dirty = true;
  edits++;
  updateSaveState();
  updateCounts();
  $("rules").append(entry("rule"));
  updateCounts();
};
document.querySelectorAll(".tabs button").forEach(
  (button) =>
    (button.onclick = () => {
      document
        .querySelectorAll(".tabs button")
        .forEach((b) => b.classList.toggle("active", b === button));
      document
        .querySelectorAll(".tab")
        .forEach((t) => (t.hidden = t.id !== button.dataset.tab));
    }),
);
$("train").onclick = async () => {
  const id = selected.id,
    version = navigation;
  try {
    if (dirty) await saveAgent();
    await api("/api/agents/" + id + "/train", { method: "POST" });
    if (version !== navigation) return;
    selected.training = "running";
    status();
    notify("Обучение запущено. Это может занять несколько минут.");
    poll();
  } catch (e) {
    if (version === navigation) notify(e.message, true);
  }
};

function poll() {
  clearTimeout(timer);
  if (selected?.training === "running") {
    const id = selected.id;
    timer = setTimeout(async () => {
      try {
        const a = await api("/api/agents/" + id);
        if (selected?.id !== id) return;
        Object.assign(selected, {
          training: a.training,
          error: a.error,
          has_model: a.has_model,
          stale: a.stale,
          model_revision: a.model_revision,
        });
        status();
        if (a.training === "ready")
          notify(
            a.stale
              ? "Модель обучена, но настройки изменились во время обучения."
              : "Обучение завершено.",
          );
        if (a.training === "failed")
          notify("Обучение не удалось. Подробности показаны ниже.", true);
        poll();
      } catch (e) {
        notify(e.message, true);
      }
    }, 3000);
  }
}
function addMessage(role, text) {
  $("messages").querySelector(".chat-placeholder")?.remove();
  const d = document.createElement("div");
  d.className = "bubble " + role;
  d.textContent = text;
  $("messages").append(d);
  $("messages").scrollTop = $("messages").scrollHeight;
}
function showTrace(trace) {
  const names = {
    reply: "Ответ",
    ask: "Запрос данных",
    handoff: "Передача агенту",
    fallback: "Ответ по умолчанию",
  };
  $("trace").className = "";
  $("trace").innerHTML = trace
    .map((t, i) => {
      const confidence = Math.min(
        100,
        Math.max(0, Math.round((t.intent?.confidence || 0) * 100)),
      );
      return `<section class="trace-step"><strong>${i + 1}. ${esc(t.agent || "Маршрутизация")}</strong>${t.error ? `<p>${esc(t.error)}</p>` : `<dl><div><dt>Намерение</dt><dd>${esc(t.intent?.name || "Не определено")}</dd></div><div><dt>Уверенность</dt><dd>${confidence}%</dd></div></dl><progress value="${confidence}" max="100" aria-label="Уверенность ${confidence}%"></progress><dl><div><dt>Состояние</dt><dd>${esc(t.state)}</dd></div><div><dt>Действие</dt><dd>${esc(names[t.action] || t.action)}</dd></div><div><dt>Сущности</dt><dd>${esc((t.entities || []).map((e) => e.entity + ": " + e.value).join(", ") || "Не найдены")}</dd></div>${t.next_state ? `<div><dt>Следующее состояние</dt><dd>${esc(t.next_state)}</dd></div>` : ""}</dl>${t.stale ? "<p>Модель требует переобучения</p>" : ""}`}</section>`;
    })
    .join("");
}
async function loadMessages() {
  const version = navigation,
    requestedSession = session;
  $("messages").innerHTML =
    '<div class="chat-placeholder"><strong>Начните тестовый диалог</strong><p>Напишите одну из обучающих фраз или проверьте новую формулировку.</p></div>';
  $("trace").className = "trace-empty";
  $("trace").textContent =
    "Здесь появятся намерение, сущности и выбранное действие.";
  if (session) {
    let history;
    try {
      history = await api("/api/sessions/" + requestedSession + "/messages");
    } catch (e) {
      if (e.status === 404 && version === navigation) {
        session = null;
        localStorage.removeItem("session:" + selected.id);
        return;
      }
      throw e;
    }
    if (version !== navigation) return;
    history.forEach((m) => {
      addMessage("user", m.text);
      addMessage("bot", m.response);
    });
    if (history.length) showTrace(history[history.length - 1].trace);
  }
}
$("reset-chat").onclick = () => {
  navigation++;
  session = null;
  localStorage.removeItem("session:" + selected.id);
  loadMessages();
};
$("chat-form").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("chat-input"),
    text = input.value.trim();
  if (!text || !selected || e.target.querySelector("button").disabled) return;
  const id = selected.id,
    version = navigation,
    button = e.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Обработка...";
  try {
    const result = await api("/api/agents/" + id + "/chat", {
      method: "POST",
      body: JSON.stringify({ text, session_id: session }),
    });
    if (version !== navigation) return;
    session = result.session_id;
    localStorage.setItem("session:" + id, session);
    if (input.value.trim() === text) input.value = "";
    addMessage("user", text);
    addMessage("bot", result.response);
    showTrace(result.trace);
  } catch (err) {
    if (version === navigation) notify(err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Отправить";
  }
};
for (const id of ["new", "save", "delete", "train"]) {
  const button = $(id),
    handler = button.onclick;
  button.onclick = async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await handler();
    } finally {
      button.disabled =
        id === "train" && (demoMode || selected?.training === "running");
    }
  };
}

function updateSaveState() {
  $("save-state").textContent = dirty
    ? "Есть изменения"
    : "Изменения сохранены";
}
function updateCounts() {
  const c = {};
  for (const [id, key] of [
    ["intent-count", "intents"],
    ["entity-count", "entities"],
    ["rule-count", "rules"],
  ]) {
    c[key] = $(key).children.length;
    $(id).textContent = c[key];
  }
  const examples = [...$("intents").querySelectorAll("textarea")].reduce(
    (n, e) => n + e.value.split("\n").filter((x) => x.trim()).length,
    0,
  );
  $("training-summary").innerHTML = [
    ["Намерения", c.intents],
    ["Примеры фраз", examples],
    ["Сущности", c.entities],
    ["Правила", c.rules],
  ]
    .map(([label, count]) => `<div><dt>${label}</dt><dd>${count}</dd></div>`)
    .join("");
}
document.querySelectorAll("[data-section]").forEach(
  (button) =>
    (button.onclick = () => {
      document.querySelectorAll("[data-section]").forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      document
        .querySelectorAll(".settings-section")
        .forEach(
          (section) => (section.hidden = section.id !== button.dataset.section),
        );
    }),
);
document
  .querySelectorAll("[data-tab]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      document
        .querySelectorAll("[data-tab]")
        .forEach((b) => b.setAttribute("aria-selected", String(b === button))),
    ),
  );
$("reconnect").onclick = () => location.reload();

const demoKey = "atlas-interface-preview-v1";
let demoAgents = [];
function enableDemo() {
  demoMode = true;
  $("demo-banner").hidden = false;
  $("connection-status").textContent = "Режим просмотра";
  try {
    demoAgents = JSON.parse(localStorage.getItem(demoKey) || "null") || [];
  } catch {
    demoAgents = [];
  }
  if (!Array.isArray(demoAgents) || !demoAgents.every((a) => a.config && a.id))
    demoAgents = [];
  if (!demoAgents.length) {
    const examples = [
      {
        name: "schedule",
        examples: [
          "Покажи расписание",
          "Когда начинается занятие?",
          "Во сколько следующая пара?",
        ],
      },
      { name: "greeting", examples: ["Здравствуйте", "Добрый день", "Привет"] },
    ];
    const config = {
      intents: examples,
      entities: [{ name: "group_number", pattern: "РИМ-[0-9]+" }],
      rules: [
        {
          state: "start",
          intent: "schedule",
          action: "reply",
          text: "Расписание доступно в учебном кабинете.",
          next_state: "start",
          target_agent: "",
        },
      ],
      fallback: "Уточните вопрос, пожалуйста.",
      threshold: 0.35,
    };
    demoAgents = [
      {
        id: "preview-study",
        name: "Учебный помощник",
        description:
          "Помогает студентам с расписанием занятий и учебными вопросами.",
        config,
        revision: 1,
        version: 1,
        has_model: false,
        stale: true,
        training: "idle",
        error: "",
      },
      {
        id: "preview-orders",
        name: "Помощник по заказам",
        description: "Отвечает на вопросы о заказах и доставке.",
        config: {
          ...structuredClone(config),
          intents: [
            {
              name: "order_status",
              examples: [
                "Где мой заказ?",
                "Узнать статус заказа",
                "Когда привезут заказ?",
              ],
            },
            {
              name: "delivery",
              examples: [
                "Сколько стоит доставка?",
                "Как получить заказ?",
                "Условия доставки",
              ],
            },
          ],
          entities: [{ name: "order_number", pattern: "[0-9]{4,8}" }],
          rules: [],
        },
        revision: 1,
        version: 1,
        has_model: false,
        stale: true,
        training: "idle",
        error: "",
      },
    ];
  }
}
async function demoApi(url, options) {
  const method = options.method || "GET",
    path = url.split("/").filter(Boolean),
    id = path[2];
  if (path[1] === "sessions") return [];
  if (method === "GET")
    return structuredClone(
      id ? demoAgents.find((a) => a.id === id) : demoAgents,
    );
  if (path[3]) throw Error("Для обучения и ответов агента подключите сервер.");
  if (method === "DELETE") demoAgents = demoAgents.filter((a) => a.id !== id);
  else {
    const payload = JSON.parse(options.body);
    const name = payload.name.trim();
    if (!name) throw Error("Укажите название агента.");
    const base = demoAgents.find((a) => a.id === id) || {
      id: "preview-" + crypto.randomUUID(),
      revision: 1,
      version: 0,
      has_model: false,
      stale: true,
      training: "idle",
      error: "",
    };
    const value = {
      ...base,
      ...payload,
      name,
      version: base.version + 1,
      config: {
        intents: [],
        entities: [],
        rules: [],
        fallback: "Не удалось распознать запрос.",
        threshold: 0.35,
        ...payload.config,
      },
    };
    demoAgents = demoAgents.filter((a) => a.id !== value.id);
    demoAgents.push(value);
    localStorage.setItem(demoKey, JSON.stringify(demoAgents));
    return structuredClone(value);
  }
  localStorage.setItem(demoKey, JSON.stringify(demoAgents));
  return { ok: true };
}
async function start() {
  try {
    await refresh();
    $("connection-status").textContent = "Сервер подключён";
  } catch {
    enableDemo();
    await refresh();
  }
  if (agents.length) {
    await openAgent(agents[0].id);
    document.querySelector("[data-tab=settings]").click();
  }
}
start().catch((e) => {
  $("empty").querySelector("p").textContent = e.message;
});
const tabButtons = [...document.querySelectorAll("[data-tab]")];
document.querySelector(".tabs").setAttribute("role", "tablist");
for (const button of tabButtons) {
  button.id = "tab-" + button.dataset.tab;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", button.dataset.tab);
  const panel = $(button.dataset.tab);
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", button.id);
  button.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let i = tabButtons.indexOf(button);
    i =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabButtons.length - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + tabButtons.length) %
            tabButtons.length;
    tabButtons[i].focus();
    tabButtons[i].click();
  });
}
document.addEventListener("click", (e) => {
  const menu = document.querySelector(".agent-menu");
  if (!menu.contains(e.target)) menu.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelector(".agent-menu").open = false;
});
