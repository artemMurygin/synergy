export const meta = {
  name: 'apply-openspec-change',
  description: 'Реализация OpenSpec change по tasks.md: план групп, context-pack, волны по зависимостям (TDD), коммит на волну, регрессия, ревью не больше 2 раундов',
  whenToUse: 'Когда артефакты change (schema end-to-end-feature-design) согласованы и нужно реализовать tasks.md. args: { change: "<имя>", onlyGroups?: [n], tracks?: ["backend","portal",...], commit?: true, review?: true, baseCommit?: "<sha>", maxParallel?: 4, allowUnconfirmedUi?: false, models?: { cheap, impl, review } }',
  phases: [
    { title: 'Plan', detail: 'разбор tasks.md в группы с зависимостями (дешёвая модель)' },
    { title: 'Preflight', detail: 'базовые тесты, БД, Pencil, context-pack.md' },
    { title: 'Implement', detail: 'волны групп по TDD, коммит после каждой волны' },
    { title: 'Regression', detail: 'полные тесты и typecheck по затронутым пакетам один раз' },
    { title: 'Review', detail: 'ревью по измерениям, не больше 2 раундов, чиним blocking и major' },
    { title: 'Wrap-up', detail: 'отметка задач в tasks.md, итог (дешёвая модель)' },
  ],
}

// ---------- параметры ----------
const A = args || {}
if (!A.change) throw new Error('args.change обязателен: имя change в openspec/changes/')
const ROOT = '/Users/artemmurygin/Desktop/СИНЕРГИЯ/Проекты'
const CHANGE = 'openspec/changes/' + A.change
const PACK = CHANGE + '/.apply/context-pack.md'
const PEN = 'design/synergy-design.pen'
const COMMIT = A.commit !== false
const REVIEW = A.review !== false
const MAX_PAR = A.maxParallel || 4
const M = A.models || {}
const CHEAP = { model: M.cheap || 'haiku', effort: 'low' }
const IMPL = { model: M.impl || 'sonnet' }
const REV = { model: M.review || 'opus' }
const PACKAGES = ['backend', 'portal', 'control-center', 'manager-helper']
const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

// ---------- схемы ----------
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    groups: { type: 'array', items: { type: 'object', properties: {
      n: { type: 'integer' }, title: { type: 'string' },
      track: { type: 'string', description: 'backend | portal | control-center | manager-helper | integration | review' },
      depends: { type: 'array', items: { type: 'integer' } },
      specs: { type: 'array', items: { type: 'string' } },
      arch: { type: 'array', items: { type: 'string' } },
      files: { type: 'array', items: { type: 'string' } },
      frames: { type: 'array', items: { type: 'string' } },
      tasks: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, text: { type: 'string' }, done: { type: 'boolean' } }, required: ['id', 'text', 'done'] } },
      inferred: { type: 'boolean' },
    }, required: ['n', 'title', 'track', 'depends', 'tasks'] } },
    uiConfirmed: { type: 'boolean' },
    uiNote: { type: 'string' },
  },
  required: ['groups', 'uiConfirmed'],
}

const PRE_SCHEMA = {
  type: 'object',
  properties: {
    baseCommit: { type: 'string' },
    packages: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, ok: { type: 'boolean' }, failing: { type: 'array', items: { type: 'string' } } }, required: ['name', 'ok', 'failing'] } },
    dbUrl: { type: 'string', description: 'рабочий PROGRAMS_ETL_TEST_ADMIN_URL или пустая строка' },
    pencilAvailable: { type: 'boolean' },
    nextMigration: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['baseCommit', 'packages', 'dbUrl', 'pencilAvailable', 'notes'],
}

const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['green', 'partial', 'blocked'] },
    doneTasks: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'object', properties: {
      task: { type: 'string' }, red: { type: 'string' }, green: { type: 'string' } }, required: ['task', 'green'] } },
    filesChanged: { type: 'array', items: { type: 'string' } },
    designDeviations: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['status', 'doneTasks', 'filesChanged', 'notes'],
}

const COMMIT_SCHEMA = {
  type: 'object',
  properties: { committed: { type: 'boolean' }, sha: { type: 'string' }, note: { type: 'string' } },
  required: ['committed', 'sha'],
}

const REG_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    newFailures: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['ok', 'newFailures', 'summary'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    notFixed: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, reason: { type: 'string' } }, required: ['item', 'reason'] } },
    filesChanged: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'filesChanged'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      package: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' },
      severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
      summary: { type: 'string' }, failureScenario: { type: 'string' } },
      required: ['package', 'file', 'severity', 'summary', 'failureScenario'] } },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['refuted', 'reason'],
}

// ---------- утилиты ----------
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const k = next++
      try { out[k] = await fn(items[k], k) } catch (e) { out[k] = null }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

function toWaves(groups) {
  const ids = new Set(groups.map((g) => g.n))
  const done = new Set()
  const waves = []
  let rest = groups.slice()
  while (rest.length) {
    const ready = rest.filter((g) => (g.depends || []).every((d) => done.has(d) || !ids.has(d)))
    const wave = ready.length ? ready : [rest[0]] // цикл в зависимостях: идём по порядку
    if (!ready.length) log('Цикл в depends у группы ' + rest[0].n + ' — выполняю по порядку')
    waves.push(wave)
    wave.forEach((g) => done.add(g.n))
    rest = rest.filter((g) => !done.has(g.n))
  }
  return waves
}

function pkgOf(g) {
  return PACKAGES.includes(g.track) ? g.track : null
}

function list(xs) {
  return xs && xs.length ? xs.join('; ') : '—'
}

const COMMON = [
  'Репозиторий: ' + ROOT + '. OpenSpec change: ' + CHANGE + '. Отвечай на русском.',
  'Общие факты (команды, БД для тестов, номер миграции, контракт API, имена и пути) — в ' + PACK + '. Прочитай его первым.',
  'Правила:',
  '- Работай только над задачами из этого промпта. Не читай proposal/design/architecture/ui-design/tasks целиком: всё нужное дано ниже. Если чего-то не хватает — найди раздел по заголовку (grep -n) и прочитай только его.',
  '- Не делай ls -R и grep по всему репозиторию: структура пакета описана в его CLAUDE.md (он уже у тебя в контексте).',
  '- Тесты — только свои файлы: npx vitest run <пути>, вывод обрезай `2>&1 | tail -40`. Полный прогон пакета делает фаза Regression, не ты.',
  '- Не редактируй tasks.md. Не делай git add/commit/stash/checkout/reset — коммиты делает workflow.',
  '- Не удаляй и не ослабляй падающие тесты. Если спека и код расходятся или задача невыполнима — status blocked и вопрос в questions; не решай молча.',
].join('\n')

const TDD = [
  'TDD для каждой задачи с логикой: 1) тест по требованию спеки; 2) прогон — red по ожидаемой причине (нет реализации), а не из-за ошибки в тесте; 3) реализация; 4) прогон — green, затем typecheck пакета.',
  'В evidence по каждой задаче: команда и 2-5 последних строк вывода red и green. Задачи с пометкой «без тестов» — реализация и typecheck, red/green не нужны.',
].join('\n')

function designBlock(g) {
  if (!g.frames || !g.frames.length) return ''
  return [
    'Макеты: ' + PEN + ', фреймы: ' + g.frames.join(', ') + '. Файл зашифрован — только mcp__pencil__* (один ToolSearch: select:mcp__pencil__get_app_state,mcp__pencil__execute,mcp__pencil__read_skill).',
    'До вёрстки прочитай каждый фрейм через execute/Get (структура, тексты, токены, размеры). Сверка — в этой же задаче по правилу frontend-ui-verification (раздел «Сверка с макетом»): один скриншот готового экрана, не больше 3 циклов правок на экран. Что не удалось привести к макету — в designDeviations.',
  ].join('\n')
}

function groupPrompt(g, pre, retryNote) {
  const pkg = pkgOf(g)
  const tasks = g.tasks.filter((t) => !t.done).map((t) => '- ' + t.id + ' ' + t.text).join('\n')
  return [
    COMMON,
    TDD,
    '',
    'Группа ' + g.n + ': ' + g.title + ' (трек ' + g.track + (pkg ? ', пакет ' + pkg + '/' : '') + ').',
    'Задачи:\n' + tasks,
    'Требования из specs change (найди по названию в ' + CHANGE + '/specs/**/spec.md): ' + list(g.specs),
    'Строки architecture.md (сущности, сервисы, методы, компоненты): ' + list(g.arch),
    'Файлы и области: ' + list(g.files),
    'БД для тестов: ' + (pre.dbUrl ? 'PROGRAMS_ETL_TEST_ADMIN_URL=' + pre.dbUrl : 'недоступна — DB-тесты напиши, но отметь как не прогнанные в notes и верни partial'),
    designBlock(g),
    retryNote ? 'Это повторная попытка. Прошлый результат: ' + retryNote + '\nДоведи невыполненное, не переделывай готовое.' : '',
  ].filter(Boolean).join('\n')
}

async function commitStep(label, files, message, phaseName) {
  if (!COMMIT) return null
  const uniq = Array.from(new Set((files || []).filter(Boolean)))
  if (!uniq.length) return null
  return agent([
    'Репозиторий ' + ROOT + '. Сделай коммит только этих файлов (в рабочем дереве есть чужие изменения — их не трогай):',
    uniq.join('\n'),
    'Команды: git add -- <файлы>; удалённые файлы — git rm --cached -- <файл>. Затем git commit с сообщением (Conventional Commits, тело на русском):',
    message,
    '',
    CO_AUTHOR,
    'Если после add нечего коммитить — committed=false. Не делай push, amend, reset. Верни sha нового коммита (git rev-parse HEAD).',
  ].join('\n'), { ...CHEAP, label: 'commit: ' + label, phase: phaseName, schema: COMMIT_SCHEMA })
}

// ---------- Plan ----------
phase('Plan')
const plan = await agent([
  'Репозиторий ' + ROOT + '. Прочитай ' + CHANGE + '/tasks.md и раздел «Confirmation Checklist» в ' + CHANGE + '/ui-design.md (если файла нет — uiConfirmed=true, uiNote="ui-design нет").',
  'Разбери tasks.md в группы. Группа — заголовок `## N. Название`. Под заголовком строки метаданных вида `> track: ...`, `> depends: 1, 2`, `> specs: ...`, `> arch: ...`, `> files: ...`, `> frames: ...` (значения через `;` или `,`; `—` = пусто).',
  'tasks — все чекбоксы группы: id (вида 5.1), полный текст без номера, done = отмечен [x].',
  'Если метаданных нет (старый формат), выведи их сам и поставь inferred=true: track по путям и названию группы (backend/, portal/, control-center/, manager-helper/; интеграция и документация — integration; code review — review), depends — предыдущая группа того же трека, frames — Node ID из текста задач.',
  'uiConfirmed = все пункты Confirmation Checklist в ui-design.md отмечены [x]. В uiNote — какие не отмечены.',
  'Ничего не меняй в файлах.',
].join('\n'), { ...CHEAP, label: 'plan', schema: PLAN_SCHEMA })

if (!plan || !plan.groups || !plan.groups.length) return { error: 'Не удалось разобрать tasks.md' }

let groups = plan.groups.filter((g) => g.track !== 'review')
const reviewGroup = plan.groups.find((g) => g.track === 'review')
if (A.onlyGroups) groups = groups.filter((g) => A.onlyGroups.includes(g.n))
if (A.tracks) groups = groups.filter((g) => A.tracks.includes(g.track) || g.track === 'integration')
const alreadyDone = groups.filter((g) => g.tasks.every((t) => t.done)).map((g) => g.n)
groups = groups.filter((g) => !alreadyDone.includes(g.n))
if (alreadyDone.length) log('Уже выполнены, пропускаю группы: ' + alreadyDone.join(', '))
if (plan.groups.some((g) => g.inferred)) log('В tasks.md нет метаданных групп — план выведен автоматически, проверь зависимости в итоге')

const skipped = []
if (!plan.uiConfirmed && !A.allowUnconfirmedUi) {
  const ui = groups.filter((g) => g.frames && g.frames.length)
  if (ui.length) {
    ui.forEach((g) => skipped.push({ n: g.n, reason: 'ui-design.md не подтверждён: ' + (plan.uiNote || '') }))
    groups = groups.filter((g) => !(g.frames && g.frames.length))
    log('ui-design.md не подтверждён — группы с макетами пропущены: ' + ui.map((g) => g.n).join(', '))
  }
}

const touched = Array.from(new Set(groups.map(pkgOf).filter(Boolean)))
const needPencil = groups.some((g) => g.frames && g.frames.length)

// ---------- Preflight ----------
phase('Preflight')
const pre = await agent([
  'Репозиторий ' + ROOT + ', change ' + CHANGE + '. Подготовь реализацию. Ничего не реализуй и не коммить.',
  '1. baseCommit: ' + (A.baseCommit ? 'используй ' + A.baseCommit : 'git rev-parse HEAD') + '.',
  '2. Базовое состояние пакетов ' + (touched.join(', ') || '—') + ': в каждом `npm run typecheck 2>&1 | tail -20` и `npm test 2>&1 | tail -30`. В failing — тесты и ошибки, которые падают уже до изменений.',
  touched.includes('backend') ? '3. БД для тестов: проверь `docker ps`; если PostgreSQL backend не запущен, а Docker работает — `cd backend && npm run infra:up`. Проверь URL postgresql://audit:audit@127.0.0.1:5433/postgres (например, тестом миграции auth). Рабочий URL — в dbUrl, иначе пустая строка. Другие пароли и порты не подбирай. nextMigration — следующий номер в backend/db/migrations.' : '3. БД не нужна: dbUrl пустой.',
  needPencil ? '4. Pencil: ToolSearch select:mcp__pencil__get_app_state, затем get_app_state по ' + PEN + '. Работает — pencilAvailable=true.' : '4. Pencil не нужен: pencilAvailable=true.',
  '5. Создай ' + PACK + ' (каталог .apply создай; он в .gitignore). Объём — не больше ~8k токенов, только факты, без пересказа proposal. Разделы:',
  '   - «Команды» по затронутым пакетам и строка запуска DB-тестов (если есть dbUrl);',
  '   - «Миграции»: следующий номер и формат имени;',
  '   - «Контракт API»: эндпоинты (метод, путь, роль), DTO запроса и ответа, коды ошибок — из specs и design.md change; только то, что меняет этот change;',
  '   - «Имена и пути»: из architecture.md — сущности, VO, сервисы, ключевые сигнатуры, страницы, фичи, компоненты, хуки → файл, где они будут жить;',
  '   - «Решения»: по одной строке на каждое решение из design.md;',
  '   - «Базовые падения»: что уже падает до изменений.',
].join('\n'), { ...IMPL, label: 'preflight', schema: PRE_SCHEMA })

if (!pre) return { error: 'Preflight не выполнен' }
if (needPencil && !pre.pencilAvailable) {
  const ui = groups.filter((g) => g.frames && g.frames.length)
  ui.forEach((g) => skipped.push({ n: g.n, reason: 'Pencil недоступен (откройте Pencil и перезапустите с onlyGroups)' }))
  groups = groups.filter((g) => !(g.frames && g.frames.length))
  log('Pencil недоступен — группы с макетами пропущены: ' + ui.map((g) => g.n).join(', '))
}

// ---------- Implement ----------
phase('Implement')
const results = {}
const blocked = new Set()
const waves = toWaves(groups)
log('Волн: ' + waves.length + ' — ' + waves.map((w) => '[' + w.map((g) => g.n).join(',') + ']').join(' → '))

for (let wi = 0; wi < waves.length; wi++) {
  const wave = waves[wi].filter((g) => {
    const dep = (g.depends || []).find((d) => blocked.has(d))
    if (dep !== undefined) {
      blocked.add(g.n)
      skipped.push({ n: g.n, reason: 'зависит от заблокированной группы ' + dep })
      return false
    }
    return true
  })
  if (!wave.length) continue

  const res = await pool(wave, MAX_PAR, async (g) => {
    const label = g.track + ' ' + g.n + ': ' + g.title
    let r = await agent(groupPrompt(g, pre), { ...IMPL, label, phase: 'Implement', schema: GROUP_SCHEMA })
    if (r && r.status === 'partial') {
      const again = await agent(groupPrompt(g, pre, JSON.stringify({ doneTasks: r.doneTasks, notes: r.notes, questions: r.questions })),
        { ...IMPL, label: label + ' (повтор)', phase: 'Implement', schema: GROUP_SCHEMA })
      if (again) {
        again.doneTasks = Array.from(new Set((r.doneTasks || []).concat(again.doneTasks || [])))
        again.filesChanged = Array.from(new Set((r.filesChanged || []).concat(again.filesChanged || [])))
        r = again
      }
    }
    return r
  })

  const files = []
  wave.forEach((g, i) => {
    const r = res[i] || { status: 'blocked', doneTasks: [], filesChanged: [], notes: 'агент не вернул результат' }
    results[g.n] = r
    files.push(...(r.filesChanged || []))
    if (r.status === 'blocked') blocked.add(g.n)
  })
  await commitStep('wave ' + (wi + 1), files,
    'feat(' + A.change + '): группы ' + wave.map((g) => g.n).join(', ') + '\n\n' + wave.map((g) => '- ' + g.n + '. ' + g.title + ' — ' + (results[g.n].status)).join('\n'),
    'Implement')
  log('Волна ' + (wi + 1) + ': ' + wave.map((g) => g.n + '=' + results[g.n].status).join(', '))
}

// ---------- Regression ----------
phase('Regression')
async function regression(pkg, phaseName) {
  const base = (pre.packages || []).find((p) => p.name === pkg)
  const regPrompt = [
    'Репозиторий ' + ROOT + ', пакет ' + pkg + '/. Полная проверка: npm run typecheck, npm test' + (pkg === 'backend' || pkg === 'manager-helper' ? ', npm run lint' : '') + '. Вывод обрезай `2>&1 | tail -60`.',
    pkg === 'backend' && pre.dbUrl ? 'Тесты запускай с PROGRAMS_ETL_TEST_ADMIN_URL=' + pre.dbUrl + '.' : '',
    'Падения, которые были до изменений (не считаются новыми): ' + list(base ? base.failing : []),
    'newFailures — только новые падения (имя теста или ошибка typecheck/lint с файлом). Ничего не исправляй.',
  ].filter(Boolean).join('\n')
  let r = null
  for (let i = 1; i <= 2; i++) {
    r = await agent(regPrompt, { ...CHEAP, label: 'regression ' + pkg + ' #' + i, phase: phaseName, schema: REG_SCHEMA })
    if (!r || r.ok || !r.newFailures.length || i === 2) break
    const fix = await agent([COMMON, 'Пакет ' + pkg + '/. Исправь новые падения после реализации change (не ослабляя тесты; если падение — следствие ошибки в тесте, исправь тест и объясни в notFixed/fixed):', r.newFailures.join('\n')].join('\n'),
      { ...IMPL, label: 'regression fix ' + pkg, phase: phaseName, schema: FIX_SCHEMA })
    if (fix) await commitStep('regression ' + pkg, fix.filesChanged, 'fix(' + A.change + '): регрессия в ' + pkg, phaseName)
  }
  return r
}
const regressionOut = {}
await parallel(touched.map((pkg) => async () => { regressionOut[pkg] = await regression(pkg, 'Regression') }))

// ---------- Review ----------
let remainingFindings = []
let reviewRounds = 0
if (REVIEW && Object.keys(results).length) {
  phase('Review')
  const base = pre.baseCommit
  const DIMS = [
    { key: 'spec', text: 'Соответствие specs и design.md этого change: каждое требование и сценарий реализованы и покрыты тестом, нет лишнего поведения. Читай ' + CHANGE + '/specs/**/spec.md и design.md целиком.' },
    { key: 'standards', text: 'Стандарты проекта: CLAUDE.md пакетов и правила .claude/rules (code-style, logging, frontend-ui-verification), слои DDD/hexagonal на бэкенде, публичный API фич и query options на фронте, качество тестов.' },
    { key: 'correctness', text: 'Корректность: ошибки логики, гонки, обработка ошибок и граничных случаев, безопасность (авторизация, роли, валидация входа), миграции.' },
  ]
  let since = base
  for (let round = 1; round <= 2; round++) {
    reviewRounds = round
    const diffCmd = COMMIT ? 'git diff ' + since + '..HEAD' : 'git diff ' + since
    const found = await parallel(DIMS.map((d) => () => agent([
      'Репозиторий ' + ROOT + ', change ' + CHANGE + '. Ревью изменений: `' + diffCmd + ' --stat`, затем diff по нужным файлам. Ничего не меняй.',
      'Измерение: ' + d.text,
      round === 2 ? 'Это второй раунд: смотри только исправления после первого раунда и не повторяй уже исправленные находки.' : '',
      'severity: blocking — сломано поведение из спеки, потеря данных, дыра в безопасности; major — существенный дефект или нарушение архитектуры; minor — остальное. В failureScenario — конкретные входные данные и неверный результат.',
    ].filter(Boolean).join('\n'), { ...REV, label: 'review ' + d.key + ' #' + round, phase: 'Review', schema: FINDINGS_SCHEMA })))
    const all = found.filter(Boolean).flatMap((r) => r.findings || [])
    // blocking проверяем одним скептиком, major принимаем как есть
    const checked = await parallel(all.map((f) => async () => {
      if (f.severity !== 'blocking') return f
      const v = await agent([
        'Репозиторий ' + ROOT + '. Попробуй опровергнуть находку ревью, прочитав код и спеку change ' + CHANGE + '. Если сомневаешься — refuted=false.',
        JSON.stringify(f),
      ].join('\n'), { ...REV, effort: 'medium', label: 'verify ' + f.file, phase: 'Review', schema: VERDICT_SCHEMA })
      return v && v.refuted ? null : f
    }))
    const confirmed = checked.filter(Boolean)
    const toFix = confirmed.filter((f) => f.severity !== 'minor')
    remainingFindings = confirmed.filter((f) => f.severity === 'minor')
    log('Ревью #' + round + ': blocking/major ' + toFix.length + ', minor ' + remainingFindings.length)
    if (!toFix.length) break
    if (round === 2) { remainingFindings = confirmed; break }

    const byPkg = {}
    toFix.forEach((f) => { (byPkg[f.package] = byPkg[f.package] || []).push(f) })
    const fixes = await parallel(Object.keys(byPkg).map((pkg) => () => agent([
      COMMON,
      'Исправь подтверждённые находки ревью в ' + pkg + '. Для дефекта поведения — сначала тест, воспроизводящий его (red), потом исправление (green).',
      JSON.stringify(byPkg[pkg], null, 1),
    ].join('\n'), { ...IMPL, label: 'review fix ' + pkg, phase: 'Review', schema: FIX_SCHEMA })))
    const fixFiles = fixes.filter(Boolean).flatMap((f) => f.filesChanged || [])
    const c = await commitStep('review fixes', fixFiles, 'fix(' + A.change + '): исправления по ревью', 'Review')
    if (c && c.sha) since = c.sha + '~1'
    for (const pkg of Object.keys(byPkg).filter((p) => touched.includes(p))) regressionOut[pkg] = await regression(pkg, 'Review')
  }
}

// ---------- Wrap-up ----------
phase('Wrap-up')
const doneTasks = []
Object.keys(results).forEach((n) => (results[n].doneTasks || []).forEach((t) => doneTasks.push(t)))
const reviewClean = REVIEW && reviewRounds > 0 && !remainingFindings.some((f) => f.severity !== 'minor')
const allGreen = !skipped.length && Object.keys(results).every((n) => results[n].status === 'green')
if (reviewClean && allGreen && reviewGroup) reviewGroup.tasks.forEach((t) => doneTasks.push(t.id))
if (doneTasks.length) {
  await agent([
    'Репозиторий ' + ROOT + '. В ' + CHANGE + '/tasks.md отметь выполненными ([ ] → [x]) ровно эти задачи: ' + doneTasks.join(', ') + '. Больше ничего в файле не меняй.',
    COMMIT ? 'Затем закоммить только tasks.md: git add -- ' + CHANGE + '/tasks.md; git commit -m "chore(' + A.change + '): отметить выполненные задачи" -m "' + CO_AUTHOR + '".' : 'Не коммить.',
  ].join('\n'), { ...CHEAP, label: 'mark tasks', phase: 'Wrap-up' })
}

const groupsOut = Object.keys(results).map((n) => ({
  n: Number(n), status: results[n].status, done: results[n].doneTasks,
  questions: results[n].questions || [], designDeviations: results[n].designDeviations || [], notes: results[n].notes,
}))
return {
  change: A.change,
  baseCommit: pre.baseCommit,
  groups: groupsOut,
  skipped,
  blocked: groupsOut.filter((g) => g.status === 'blocked'),
  questions: groupsOut.flatMap((g) => g.questions.map((q) => 'Группа ' + g.n + ': ' + q)),
  designDeviations: groupsOut.flatMap((g) => g.designDeviations.map((d) => 'Группа ' + g.n + ': ' + d)),
  regression: regressionOut,
  review: { rounds: reviewRounds, clean: reviewClean, remaining: remainingFindings },
  notes: pre.notes,
}
