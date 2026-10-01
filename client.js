/**
 * Browser half of @deepseek-ai/dsh-web-search-camofox: the configuration page
 * for the `web-search-camofox` settings namespace, contributed to the Plugins
 * page as the configuration of this bundle's own row.
 *
 * The row gains a configure control keyed `<package name>#<row id>`; the page
 * renders `view: 'summary'` as the row one-liner and `view: 'page'` as the form.
 * Values arrive over `ctx.configForms` (the Host settings mirror) and are
 * written back field by field, so a committed engine reaches the very next
 * search without a restart. No Harness Client package is imported: the only
 * module this artifact needs from the browser table is React.
 * @module @deepseek-ai/dsh-web-search-camofox/client
 */

window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-web-search-camofox',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Settings namespace the Host plugin installs through `settings.installSection`. */
    const SETTINGS_NS = 'web-search-camofox'
    /** The Plugins page dispatches a row's configuration by `<package name>#<row id>`. */
    const ROW_KEY = '@deepseek-ai/dsh-web-search-camofox#web-search-camofox'
    const SLOT_ROW_CONFIG = 'plugins.row.config'
    /** Locale namespace this client half owns. */
    const NS = 'settings.webSearchCamofox'

    /** SearxNG routes: the engines that answer a headless tab today. */
    const SEARX_ENGINES = ['searx', 'searx-ingres', 'searx-tiekoetter']
    const DIRECT_ENGINES = ['duckduckgo', 'yandex']
    /** The result page a direct engine opens, mirroring the Host routing table. */
    const DIRECT_URLS = {
      duckduckgo: 'https://html.duckduckgo.com/html/?q={query}',
      yandex: 'https://yandex.com/search/?text={query}',
    }
    /** Server-side macros: reachable, but each engine stands behind bot protection. */
    const MACRO_ENGINES = [
      'google', 'youtube', 'amazon', 'reddit', 'wikipedia', 'twitter', 'yelp',
      'spotify', 'netflix', 'linkedin', 'instagram', 'tiktok', 'twitch',
    ]
    /** Defaults the Host plugin carries, shown as the placeholder of each field. */
    const DEFAULTS = {
      baseURL: 'http://localhost:9377',
      userId: 'default-user',
      sessionKey: 'dsh-web-search',
      apiKeyEnv: 'CAMOFOX_API_KEY',
      maxSnapshotChars: 60000,
      concurrency: 1,
      retries: 2,
      retryDelayMs: 750,
      closeSettleMs: 300,
    }

    /** Text and select fields; `advanced` ones hide behind a disclosure. */
    const FIELDS = [
      { key: 'engine', kind: 'select' },
      { key: 'searchUrl', kind: 'text' },
      { key: 'baseURL', kind: 'text' },
      { key: 'apiKeyEnv', kind: 'text', advanced: true },
      { key: 'userId', kind: 'text', advanced: true },
      { key: 'sessionKey', kind: 'text', advanced: true },
      { key: 'maxSnapshotChars', kind: 'number', advanced: true },
      { key: 'concurrency', kind: 'number', advanced: true },
      { key: 'retries', kind: 'number', advanced: true },
      { key: 'retryDelayMs', kind: 'number', advanced: true },
      { key: 'closeSettleMs', kind: 'number', advanced: true },
    ]

    const en = {
      title: 'Camofox browser search',
      description: 'Search through a camofox-browser tab; pick the engine it drives.',
      engine: 'Search engine',
      engineHint: 'The results page the tab navigates to. SearxNG instances answer a headless browser; the macro engines below usually meet a bot wall or a consent screen first.',
      groupSearx: 'SearxNG (works)',
      groupMacro: 'camofox macros (usually blocked)',
      groupDirect: 'Direct result pages',
      directNote: 'Opens the results page on the site itself, so a bot wall can answer instead of results.',
      searchUrl: 'Results URL override',
      searchUrlHint: 'Any SearxNG-compatible results page containing {query}. Clears the engine route.',
      baseURL: 'camofox server',
      baseURLHint: 'REST base URL of the camofox-browser container.',
      apiKeyEnv: 'Credential reference',
      apiKeyEnvHint: 'Credential name resolved for the server key. The key itself stays in the credential store.',
      userId: 'camofox user',
      userIdHint: 'The identity that owns the tab and its browser profile.',
      sessionKey: 'Session key',
      sessionKeyHint: 'Identifies this provider’s group of tabs.',
      maxSnapshotChars: 'Snapshot characters',
      maxSnapshotCharsHint: 'How much of the rendered results page the parser reads.',
      concurrency: 'Concurrency',
      concurrencyHint: 'camofox closes its browser context when the last tab closes, so 1 is the safe value.',
      retries: 'Retries',
      retriesHint: 'Fresh-tab attempts after a transient camofox failure.',
      retryDelayMs: 'Retry delay (ms)',
      retryDelayMsHint: 'Time a retry waits before opening its fresh tab.',
      closeSettleMs: 'Close settle (ms)',
      closeSettleMsHint: 'Pause after a tab close before the next search opens one.',
      advanced: 'Advanced',
      reset: 'Reset',
      overridden: 'overridden',
      saving: 'Saving…',
      saved: 'Saved — used from the next search.',
      refused: 'The Host refused the write.',
      failed: 'Write failed: ',
      readOnly: 'This Host document is read-only; the values below are shown as they run.',
      loading: 'Reading configuration…',
      unavailable: 'The Host is not serving this namespace to this page.',
      invalidNumber: 'Whole number expected.',
      route: 'Route',
    }

    const zh = {
      title: 'Поиск через camofox',
      description: 'Поиск через вкладку camofox-browser; выберите поисковый движок.',
      engine: 'Поисковый движок',
      engineHint: 'Страница результатов, куда переходит вкладка. SearxNG отвечает headless-браузеру; движки-макросы обычно упираются в бот-защиту.',
      groupSearx: 'SearxNG (работает)',
      groupMacro: 'Макросы camofox (часто блокируются)',
      groupDirect: 'Прямые страницы результатов',
      directNote: 'Открывает собственную страницу результатов сайта, поэтому вместо выдачи может встать антибот-страница.',
      searchUrl: 'Свой URL результатов',
      searchUrlHint: 'Любая SearxNG-совместимая страница результатов с {query}. Перекрывает маршрут движка.',
      baseURL: 'Сервер camofox',
      baseURLHint: 'REST base URL контейнера camofox-browser.',
      apiKeyEnv: 'Ссылка на учётные данные',
      apiKeyEnvHint: 'Имя учётной записи, из которой берётся ключ сервера. Сам ключ остаётся в хранилище.',
      userId: 'Пользователь camofox',
      userIdHint: 'Идентичность которой принадлежат вкладка и её профиль браузера.',
      sessionKey: 'Ключ сессии',
      sessionKeyHint: 'Помечает группу вкладок этого провайдера.',
      maxSnapshotChars: 'Символы снимка',
      maxSnapshotCharsHint: 'Сколько отрисованной страницы результатов разбирает парсер.',
      concurrency: 'Параллельность',
      concurrencyHint: 'camofox закрывает контекст браузера когда последняя вкладка закрыта, поэтому безопасное значение — 1.',
      retries: 'Повторы',
      retriesHint: 'Попытки со свежей вкладкой после временного сбоя camofox.',
      retryDelayMs: 'Пауза повтора (мс)',
      retryDelayMsHint: 'Сколько ждёт повтор перед открытием свежей вкладки.',
      closeSettleMs: 'Пауза после закрытия (мс)',
      closeSettleMsHint: 'Пауза после закрытия вкладки перед открытием следующей.',
      advanced: 'Дополнительно',
      reset: 'Сбросить',
      overridden: 'переопределено',
      saving: 'Сохранение…',
      saved: 'Сохранено — будет использовано со следующего поиска.',
      refused: 'Host отклонил запись.',
      failed: 'Ошибка записи: ',
      readOnly: 'Документ Host доступен только для чтения; значения показаны как есть.',
      loading: 'Чтение конфигурации…',
      unavailable: 'Host не отдаёт это пространство настроек данной странице.',
      invalidNumber: 'Ожидается целое число.',
      route: 'Маршрут',
    }

    /** Shared control styling: theme tokens only, so light and dark both read correctly. */
    const styles = {
      root: { display: 'grid', gap: '14px', maxWidth: '620px' },
      field: { display: 'grid', gap: '4px' },
      head: { display: 'flex', alignItems: 'baseline', gap: '8px' },
      label: { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: '600' },
      badge: { color: 'var(--dsw-alias-brand-primary)', fontSize: '11px' },
      reset: {
        background: 'transparent', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px',
        color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', padding: '1px 6px', cursor: 'pointer',
      },
      control: {
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px', padding: '6px 8px',
        font: 'inherit', fontSize: '13px', maxWidth: '420px',
      },
      hint: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.45' },
      warn: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: '12px' },
      ok: { color: 'var(--dsw-alias-state-success-primary)', fontSize: '12px' },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px' },
      summary: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
      disclosure: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', cursor: 'pointer' },
      code: {
        fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)', fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)',
      },
    }

    /**
     * One mutable section snapshot with the page's own write status on top.
     * The snapshot object is replaced only when something actually moved, so
     * `useSyncExternalStore` sees a stable reference between notifications.
     */
    class CardStore {
      /** @param form - the shared form for the `web-search-camofox` namespace. */
      constructor(form) {
        this.form = form
        this.listeners = new Set()
        this.pending = null
        this.notice = null
        this.snapshot = this.#project()
        this.off = form.subscribe(() => this.#publish())
      }

      /** @returns the current snapshot (stable until the next change). */
      getSnapshot = () => this.snapshot

      /**
       * @param listener - called after every snapshot replacement.
       * @returns the disposer removing it.
       */
      subscribe = (listener) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
      }

      /**
       * Queue one field write; an empty text clears the field back to the plugin default.
       * @param field - the Config field name.
       * @param value - the JSON-shaped value to store.
       * @returns nothing; the outcome lands in the snapshot notice.
       */
      async set(field, value) {
        this.#patch({ pending: field, notice: null })
        try {
          const ok = await this.form.set(field, value)
          this.#patch({ pending: null, notice: ok ? { kind: 'ok', text: 'saved' } : { kind: 'error', text: 'refused' } })
        } catch (error) {
          this.#patch({ pending: null, notice: { kind: 'error', text: String(error && error.message || error) } })
        }
      }

      /**
       * Clear one field so the section re-inherits the composition layer.
       * @param field - the Config field name.
       * @returns nothing; the outcome lands in the snapshot notice.
       */
      async reset(field) {
        this.#patch({ pending: field, notice: null })
        try {
          const ok = await this.form.unset(field)
          this.#patch({ pending: null, notice: ok ? { kind: 'ok', text: 'saved' } : { kind: 'error', text: 'refused' } })
        } catch (error) {
          this.#patch({ pending: null, notice: { kind: 'error', text: String(error && error.message || error) } })
        }
      }

      /** Drop the form subscription and every listener. */
      dispose() {
        this.off()
        this.listeners.clear()
      }

      /** @returns the form snapshot merged with this page's write status. */
      #project() {
        const state = this.form.getSnapshot()
        return {
          status: state.status,
          writable: state.writable,
          value: state.value ?? {},
          user: state.user ?? {},
          pending: this.pending,
          notice: this.notice,
        }
      }

      /** @param patch - local status fields to fold into a fresh snapshot. */
      #patch(patch) {
        Object.assign(this, patch)
        this.#publish()
      }

      /** Replace the cached snapshot and wake the listeners. */
      #publish() {
        this.snapshot = this.#project()
        for (const listener of this.listeners) listener()
      }
    }

    /**
     * @param key - the field's locale key.
     * @param t - the bound translator.
     * @returns the field's hint text, or an empty string when it declares none.
     */
    function hintOf(key, t) {
      const text = t(`${key}Hint`)
      return text === `${key}Hint` ? '' : text
    }

    /** @param spec - the field descriptor. @param state - the store snapshot. @returns whether the field carries a user override. */
    function isOverridden(spec, state) {
      const user = state.user
      return user !== null && typeof user === 'object' && spec.key in user && user[spec.key] !== undefined
    }

    /** @param spec - the field descriptor. @param state - the store snapshot. @returns the value to show in the control. */
    function currentValue(spec, state) {
      const value = state.value[spec.key]
      if (value !== undefined && value !== null) return value
      return spec.key === 'engine' ? 'searx' : DEFAULTS[spec.key]
    }

    /**
     * One editable row: label, control, override marker with its reset, and the hint.
     * @param props - the field, the snapshot, locale copy, and the store actions.
     * @returns the field element.
     */
    function Field(props) {
      const { spec, state, t, store } = props
      const overridden = isOverridden(spec, state)
      const current = currentValue(spec, state)
      const disabled = !state.writable || state.status !== 'ready'
      const [draft, setDraft] = React.useState(null)
      const [invalid, setInvalid] = React.useState(false)
      const text = draft === null ? String(current ?? '') : draft

      /** @param raw - the committed text. @returns nothing; writes go through the store. */
      const commit = (raw) => {
        const trimmed = raw.trim()
        if (trimmed === '') {
          setDraft(null)
          setInvalid(false)
          if (overridden) void store.reset(spec.key)
          return
        }
        if (spec.kind === 'number') {
          const parsed = Number(trimmed)
          if (!Number.isInteger(parsed) || parsed < 0) {
            setInvalid(true)
            return
          }
          setInvalid(false)
          setDraft(null)
          void store.set(spec.key, parsed)
          return
        }
        setInvalid(false)
        setDraft(null)
        void store.set(spec.key, trimmed)
      }

      const control = spec.kind === 'select'
        ? h('select', {
          style: styles.control,
          disabled,
          value: String(current),
          onChange: (event) => { void store.set(spec.key, event.target.value) },
        },
        h('optgroup', { label: t('groupSearx') }, SEARX_ENGINES.map(id => h('option', { key: id, value: id }, id))),
        h('optgroup', { label: t('groupDirect') }, DIRECT_ENGINES.map(id => h('option', { key: id, value: id }, id))),
        h('optgroup', { label: t('groupMacro') }, MACRO_ENGINES.map(id => h('option', { key: id, value: id }, id))))
        : h('input', {
          style: styles.control,
          disabled,
          type: spec.kind === 'number' ? 'number' : 'text',
          value: text,
          placeholder: String(DEFAULTS[spec.key] ?? ''),
          onChange: (event) => { setDraft(event.target.value); if (invalid) setInvalid(false) },
          onBlur: (event) => { commit(event.target.value) },
          onKeyDown: (event) => { if (event.key === 'Enter') { commit(event.target.value); event.target.blur() } },
        })

      return h('div', { key: spec.key, style: styles.field },
        h('div', { style: styles.head },
          h('span', { style: styles.label }, t(spec.key)),
          overridden ? h('span', { style: styles.badge }, t('overridden')) : null,
          overridden ? h('button', {
            type: 'button', style: styles.reset, disabled,
            onClick: () => { void store.reset(spec.key) },
          }, t('reset')) : null),
        control,
        invalid ? h('span', { style: styles.error }, t('invalidNumber')) : null,
        h('span', { style: styles.hint }, hintOf(spec.key, t)),
        spec.key === 'engine' && MACRO_ENGINES.includes(String(current))
          ? h('span', { style: styles.warn }, t('groupMacro'))
          : spec.key === 'engine' && DIRECT_ENGINES.includes(String(current))
            ? h('span', { style: styles.hint }, t('directNote')) : null)
    }

    /**
     * The row's configuration page, or its one-liner, as the Plugins page asks.
     * @param props - the view, locale copy, the bound store hook, and the write actions.
     * @returns the summary text or the form.
     */
    function Card(props) {
      const { t } = props
      const state = props.useCamofoxCard(snapshot => snapshot)
      const store = { set: props.set, reset: props.reset }

      if (props.view === 'summary') {
        const engine = state.value.engine ?? 'searx'
        const base = state.value.baseURL ?? DEFAULTS.baseURL
        return h('span', { style: styles.summary }, `${engine} · ${base}`)
      }

      if (state.status === 'loading') return h('span', { style: styles.summary }, t('loading'))
      if (state.status === 'unavailable') return h('span', { style: styles.summary }, t('unavailable'))

      const engine = String(state.value.engine ?? 'searx')
      const route = state.value.searchUrl ?? (SEARX_ENGINES.includes(engine) ? undefined : DIRECT_URLS[engine] ?? `@${engine}_search`)

      return h('div', { style: styles.root },
        h('p', { style: styles.hint }, t('description')),
        state.writable ? null : h('p', { style: styles.warn }, t('readOnly')),
        ...FIELDS.filter(spec => !spec.advanced).map(spec => h(Field, { key: spec.key, spec, state, t, store })),
        route ? h('div', { style: styles.code }, `${t('route')}: ${route}`) : null,
        h('details', null,
          h('summary', { style: styles.disclosure }, t('advanced')),
          h('div', { style: { display: 'grid', gap: '14px', paddingTop: '10px' } },
            ...FIELDS.filter(spec => spec.advanced).map(spec => h(Field, { key: spec.key, spec, state, t, store })))),
        h('div', { style: styles.hint },
          state.pending ? h('span', null, t('saving'))
            : state.notice === null ? null
              : state.notice.kind === 'ok' ? h('span', { style: styles.ok }, t('saved'))
                : h('span', { style: styles.error }, t('failed') + (state.notice.text === 'refused' ? t('refused') : state.notice.text))))
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      /**
       * Publish the settings card for this bundle's row on the Plugins page.
       * @param ctx - the browser plugin context.
       */
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-search-camofox: dictionaries')
        const store = new CardStore(ctx.configForms.get(SETTINGS_NS))
        ctx.effect(() => () => { store.dispose() }, 'web-search-camofox: form subscription')
        const face = {
          hooks: { camofoxCard: store },
          set: (field, value) => { void store.set(field, value) },
          reset: (field) => { void store.reset(field) },
        }
        // The Plugins page declares "plugins.row.config" when it mounts, so the
        // slot is usually absent while this entry materializes. Retry until the
        // injection lands: an injection waits for a later declaration, the slot
        // subscription reacts to the page mounting, and the timer covers hosts
        // whose declaration notification never reaches a dynamic entry.
        let registered = false
        let injection = null
        let timer = undefined
        /** Attempt the registration once; every path is harmless while the slot is absent. */
        const attempt = () => {
          if (registered) return
          if (injection !== null) injection()
          injection = ctx.slots.inject(SLOT_ROW_CONFIG, () => {
            if (registered) return () => {}
            registered = true
            if (timer !== undefined) { clearInterval(timer); timer = undefined }
            return ctx.slots.register({
              name: SLOT_ROW_CONFIG, key: ROW_KEY, locale: NS, inject: () => face,
            }, Card)
          })
        }
        ctx.effect(() => {
          attempt()
          const unsubscribe = ctx.slots.subscribe(SLOT_ROW_CONFIG, attempt)
          timer = setInterval(attempt, 3000)
          return () => {
            if (timer !== undefined) clearInterval(timer)
            unsubscribe()
            if (injection !== null) injection()
          }
        }, 'web-search-camofox: row configuration')
      },
    }
  },
})