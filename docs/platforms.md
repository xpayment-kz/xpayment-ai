# Install on each platform

[Back to the README](../README.md) · [По-русски](../README.ru.md)

The `xpayment` plugin (version 0.1.0) holds four skills (`ask`, `integrate`, `migrate-v2`, `check`) and the addresses of two remote MCP servers:

| Server | Address | Sign-in |
|---|---|---|
| `xpayment-docs` | `https://api.xpayment.kz/mcp/docs` | none (public documentation) |
| `xpayment` | `https://api.xpayment.kz/mcp` | «Войти через xPayment» (OAuth) |

This page lists the steps for each platform exactly as they were checked on **2026-11-10**. Versions used: Claude Code 2.1.319, Codex CLI 0.167.0, claude.ai and chatgpt.com in a browser (Russian interface).

| Platform | Skills | Verified on 2026-11-10 |
|---|---|---|
| [Claude Code](#claude-code) | yes | install, skills, documentation server, update; the account sign-in was not run (it needs an interactive terminal) |
| [Claude (claude.ai, desktop app, Cowork)](#claude-claudeai-desktop-app-cowork) | yes | install, both connectors, sign-in, a chat, manual update (on claude.ai) |
| [Claude, connector only](#claude-connector-only-no-plugin) | no | only the menu path |
| [Codex CLI](#codex-cli) | yes | install, skills, documentation server, sign-in, update |
| [ChatGPT on the web](#chatgpt-on-the-web-custom-mcp-server-no-skills) | no (tools only) | custom server, sign-in, a chat |
| [ChatGPT desktop app](#chatgpt-desktop-app-plugin-archive) | yes | archive accepted on chatgpt.com; **not tested in the desktop app** |

About the labels: where the plugin's own rules record an English label (Customize, Plugins, + Add, Manage marketplaces, Check for updates, Connectors, Connect, Upload plugin archive, Add custom MCP server), it is written in English with the Russian label as seen in parentheses. Any other label is quoted in Russian as it appears, with a plain English meaning after it. Both claude.ai and ChatGPT change their screens from time to time, so a label may differ from what you see.

## Sign-in and rights (all platforms)

- The account server asks you to sign in with «Войти через xPayment» in your browser. If you have no account yet, registration (by SMS) is on the same page.
- After the sign-in a consent page lists the rights the AI asks for; you press «Разрешить» (allow) or «Отказать» (deny). There are seven rights. A tool that needs a right you did not give answers `SCOPE_REQUIRED`; connect again and allow that right.
- The AI acts within your own rights in xPayment. An owner reaches the whole account; a member reaches only their own cashboxes and keys; a cashier cannot connect an AI.
- The AI client identifies itself to xPayment by itself, without a form for you to fill in: Claude and ChatGPT use a client metadata document (CIMD); Codex can register itself dynamically (DCR).
- What the AI did, and revoking its access, are in the cabinet: «Настройки» → «Подключённые AI».

## Claude Code

Needs Claude Code 2.1.319 or later.

**Install** (in a terminal; the plugin is installed for your user):

```sh
claude plugin marketplace add xpayment-kz/xpayment-ai
claude plugin install xpayment@xpayment
```

The same inside a session: `/plugin marketplace add xpayment-kz/xpayment-ai`, then `/plugin install xpayment@xpayment`. Start a new session afterwards.

**What you should see.** The plugin `xpayment` 0.1.0 with four skills named `xpayment:ask`, `xpayment:check`, `xpayment:integrate` and `xpayment:migrate-v2`. The server `xpayment-docs` is connected (it offers five tools). The server `xpayment` waits for the sign-in.

**Sign in to your account.** In a session run `/mcp`, pick `plugin:xpayment:xpayment` and choose Authenticate; or in a terminal run `claude mcp login plugin:xpayment:xpayment`. The sign-in needs an interactive terminal. Your browser opens «Войти через xPayment». Claude Code identifies itself by CIMD and receives the answer on a `localhost` address. These are the steps of the plugin's rules; this one sign-in was not run in the 2026-11-10 check.

If you have already added the xPayment connectors in claude.ai, Claude Code may list them as `claude.ai xpayment` and `claude.ai xpayment-docs` and use those instead.

**Call a skill.** Type `/xpayment:ask`, `/xpayment:integrate`, `/xpayment:migrate-v2` or `/xpayment:check`, or just describe what you want.

**Update.**

```sh
claude plugin marketplace update xpayment
claude plugin update xpayment@xpayment
```

Or in a session: `/plugin` → Marketplaces → xpayment → Update marketplace. Then run `/reload-plugins` or start a new session.

**What to expect.** Claude Code keeps a cached copy of the plugin and fetches a new one only when the plugin's version number changes. If an update says you are already at the latest version while you expect something new, uninstall the plugin and install it again: that gave a fresh copy when we checked.

## Claude (claude.ai, desktop app, Cowork)

The steps were checked on claude.ai in a browser. The plugin's rules give the same path for the desktop app and for Cowork; those two were not run separately.

**Install** (Customize → Plugins → + Add; in Russian: Персонализация → Плагины → «+ Добавить»):

1. Choose «Добавить маркетплейс» (add a marketplace), then «Добавить из репозитория» (add from a repository).
2. In the search box type `xpayment-kz/xpayment-ai` and press «Синхронизация» (sync).
3. A card «xPayment» (author `xpayment-ai`) appears. Press «Добавить» (add). If a warning dialog appears, read it and press «Продолжить» (continue).
4. The plugin page shows the source `xpayment-ai`, version 0.1.0 and 4 skills. The side panel says «Может отправлять данные в другие сервисы» (it can send data to other services): the two MCP servers. The plugin holds no scripts and no hooks.

**Connect the two connectors.** The page has a list «Коннекторы · 2» (Connectors, 2).

- `xpayment-docs`: «Подключить» (connect) → «Добавить пользовательский коннектор» (add a custom connector) → «Продолжить». It is shown as «Без входа (Обнаружено)» (no sign-in, detected). Press «Добавить», then «Подключить».
- `xpayment`: the same «Подключить» → «Добавить пользовательский коннектор». It is shown as «Войти сейчас (Обнаружено)» (sign in now, detected), and the OAuth option is «Использовать опубликованные идентификационные данные Claude (Обнаружено)» (use Claude's published identity, detected): this is CIMD. Press «Добавить», then «Подключить». Your browser opens `xpayment.kz/login`: sign in with «Войти через xPayment» and press «Разрешить» on the consent page. The connector then shows as connected.

You can reach the same connectors later by Customize → Plugins → xPayment → Connectors → Connect (in Russian: Персонализация → Плагины → xPayment → Коннекторы → Подключить).

**Call a skill.** The button «Попробовать в чате» (try in chat) on the plugin page opens a chat with `/integrate …` already typed. claude.ai shows the skill as `/integrate` (not `/xpayment:integrate`). A skill also starts when your request matches it: a question about the documentation started `ask`.

**What to expect.** The first time the assistant uses a tool, claude.ai asks for permission with «Разрешить один раз» (allow once). In our test it asked for each of the four tools of a read-only question: the API passport, search in the documentation, a documentation section and the account (`whoami`). The answer was correct.

**Update.** Customize → Plugins → + Add → Manage marketplaces → `xpayment-ai` → ⋯ → Check for updates (in Russian: Персонализация → Плагины → «+ Добавить» → «Управлять маркетплейсами» → `xpayment-ai` → ⋯ → «Проверить обновления»). The marketplace shows «Синхронизировано» (synced); after the check claude.ai says «Обновлено до …» (updated to …) and may show a notice that executable files or settings may differ («Исполняемые файлы или настройки могут отличаться…»).

The switch «Синхронизировать автоматически» (Sync automatically) is off by default. To turn it on, claude.ai needs the Claude GitHub app: when you try it, a message «Предоставить доступ» (grant access) appears. Without it the marketplace still works, and you update by hand as above.

**Install from an archive instead.** Customize → Plugins → + Add → «Загрузить плагин» (Upload plugin) takes an archive that has `.claude-plugin/plugin.json` at its top level. Build one from a clone of this repository (see the Development section of the [README](../README.md#development)). It installs the same plugin; the author then shows as «xPayment».

## Claude, connector only (no plugin)

Without the plugin you get the tools and the documentation, but not the skills: the step-by-step instructions of `ask`, `integrate`, `migrate-v2` and `check` are not loaded.

Customize → Connectors → + Add → «Добавить пользовательский коннектор» (in Russian: Персонализация → Коннекторы → «+ Добавить» → «Добавить пользовательский коннектор»). Add two connectors:

- `https://api.xpayment.kz/mcp/docs` — no sign-in;
- `https://api.xpayment.kz/mcp` — OAuth, sign in with «Войти через xPayment» and press «Разрешить».

This is the same dialog that the plugin's «Коннекторы» list opens, so the sign-in works as described above. We checked only the menu path of this variant.

## Codex CLI

Verified with Codex CLI 0.167.0 (we upgraded from 0.160.1 before testing).

**Install:**

```sh
codex plugin marketplace add xpayment-kz/xpayment-ai
codex plugin add xpayment@xpayment
```

**What you should see.** `codex mcp list` shows `xpayment` and `xpayment-docs`; `xpayment` says «Not logged in» until you sign in. Codex lists the four skills as `xpayment:ask`, `xpayment:check`, `xpayment:integrate` and `xpayment:migrate-v2`.

**Sign in to your account.**

```sh
codex mcp login xpayment
```

Codex identifies itself with its published client document (CIMD, `https://chatgpt.com/oauth/codex/client.json`), your browser opens «Войти через xPayment» with a `127.0.0.1` callback, you approve, and Codex reports that you are logged in. After that `whoami` returned the owner, the seven rights and the client name «Codex». Both this form and the dynamic client registration (DCR) form below were checked on 2026-11-10:

```sh
codex mcp login xpayment --oauth-client-registration dcr
```

The browser that opens is your default one. If you are signed in to xPayment with another account there, open the printed link in the browser where you use the right account (the callback to `127.0.0.1` works from any browser on the same computer).

**Call a skill.** Name it (`xpayment:ask`, `xpayment:integrate`, …) or describe the task. When you run `codex exec` from a script, pass `</dev/null` as its input (our check needed it).

**Update.**

```sh
codex plugin marketplace upgrade xpayment
```

then start a new session. «already up to date» means there is nothing new. When the layout of the plugin's files changed, `codex plugin add xpayment@xpayment` after the upgrade installed the updated files.

## ChatGPT on the web (custom MCP server, no skills)

On chatgpt.com the account server is added as a custom MCP server. This gives ChatGPT the xPayment tools but no skills, so there is no `ask` or `integrate` to call. In the test only the account server was added; the documentation server was not.

**Steps** (Plugins → Add → Add custom MCP server; in Russian: Плагины → «Добавить» → «Добавить пользовательский сервер MCP»). The «Добавить» menu has three items: «Создать плагин» (create a plugin), «Загрузить архив плагина» (upload a plugin archive) and «Добавить пользовательский сервер MCP». In the form:

1. «Название» (name): `xPayment`. «Описание» (description): your own words.
2. «Подключение» (connection): «URL-адрес сервера» (server URL), value `https://api.xpayment.kz/mcp`. (The other choice, «Туннель», is a tunnel.)
3. «Аутентификация» (authentication): OAuth. Under «Расширенные настройки OAuth» (advanced OAuth settings) ChatGPT detected the client metadata document `https://chatgpt.com/oauth/client.json`, so there is nothing to type.
4. Tick the risk box «Я понимаю и хочу продолжить» (I understand and want to continue) and press «Создать в виде плагина» (create as a plugin). Do this yourself: it is your decision.
5. Sign in with «Войти через xPayment» and press «Разрешить».

**Call it.** In a chat type `@xPayment` and your request, or use «Попробовать в чате» (try in chat). In the test a read-only question (`whoami`) was answered without a confirmation prompt and returned the owner and the seven rights.

**Update.** Nothing to do: the server is remote, so changes reach you without a new install.

## ChatGPT desktop app (plugin archive)

ChatGPT can take the whole plugin, with its skills, as an archive. **Read this first:** chatgpt.com accepted the archive, but it can only be opened in the ChatGPT desktop app, and we did **not** test it there. The steps below are what was checked on chatgpt.com plus the plugin's own rules for the desktop app.

1. Get an archive of the `plugin/` folder (see the Development section of the [README](../README.md#development)). For 0.1.0 it is 189 KB.
2. Plugins → Add → Upload plugin archive (in Russian: Плагины → «Добавить» → «Загрузить архив плагина»). It takes `.tar.gz`, `.tgz` or `.zip` files up to 780 MB.
3. chatgpt.com showed the archive as version 0.1.0 with «Серверы MCP · 2» (2 MCP servers) and «Навыки · 4» (4 skills), and offered only «Открыть в приложении для компьютера» (open in the desktop app).
4. In the desktop app, connect `xpayment` and sign in with «Войти через xPayment» (the plugin's rules give this step; it was not run).

**Call it.** `@xPayment` in a chat.

**Update.** Upload the archive of the new release again. A server added as a custom MCP server needs no update.

**What to expect.** If you add both the custom MCP server and the plugin archive, ChatGPT shows two xPayment entries; keep one.
