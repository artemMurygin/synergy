// Fills the Featurer portal with demo data for manual checks: catalog, skills in every status,
// archived records and requests from existing users. Idempotent: rerun adds only what is missing.
// Requires migrations up to 034. Never run against production.
import pg from 'pg';

try {
    process.loadEnvFile();
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const PRODUCTS = [
    { slug: 'control-center', name: 'Control Center' },
    { slug: 'manager-helper', name: 'Manager Helper' },
    { slug: 'telegram-bot', name: 'Telegram-бот' },
    { slug: 'web', name: 'Веб' },
];

const AGENTS = [
    { slug: 'assistant', name: 'Ассистент', products: ['control-center', 'telegram-bot'] },
    { slug: 'tasks', name: 'Задачи', products: ['control-center'] },
    { slug: 'meetings', name: 'Встречи', products: ['control-center', 'manager-helper', 'telegram-bot'] },
    { slug: 'prices', name: 'Цены', products: ['control-center'] },
    { slug: 'deal-audit', name: 'Аудит сделок', products: ['manager-helper'] },
    { slug: 'telegram-tasks', name: 'Агент задач', products: ['telegram-bot'] },
    { slug: 'call-analytics', name: 'Аналитик звонков', products: ['control-center'] },
    { slug: 'sales-script', name: 'Скрипт продаж', products: ['manager-helper'] },
    { slug: 'legacy-reports', name: 'Отчёты (старые)', products: ['control-center'], archivedDaysAgo: 3 },
];

// launchedDaysAgo: first launch; set for skills that have ever been launched, including rework/testing after launch.
const SKILLS = [
    { agent: 'assistant', name: 'Сводка встречи', description: 'Короткое резюме созвона с решениями и задачами', status: 'launched', changedDaysAgo: 40, launchedDaysAgo: 40 },
    { agent: 'assistant', name: 'Ответ по базе знаний', description: 'Отвечает на вопросы по регламентам департамента', status: 'launched', changedDaysAgo: 25, launchedDaysAgo: 25 },
    { agent: 'assistant', name: 'Черновик письма', description: 'Готовит ответ клиенту по истории переписки', status: 'testing', changedDaysAgo: 4 },
    { agent: 'assistant', name: 'Дайджест просрочек', description: 'Присылает список просроченных задач отдела', status: 'rework', changedDaysAgo: 2, launchedDaysAgo: 30 },
    { agent: 'assistant', name: 'Протокол звонка', description: 'Фиксирует договорённости по телефонному звонку', status: 'in_dev', changedDaysAgo: 6 },
    { agent: 'assistant', name: 'Сверка актов', description: 'Сверяет акты из 1С с таблицами поставщиков', status: 'planned', changedDaysAgo: 1 },
    { agent: 'assistant', name: 'Старый поиск по базе', description: 'Заменён навыком «Ответ по базе знаний»', status: 'testing', changedDaysAgo: 50, archivedDaysAgo: 20 },
    { agent: 'tasks', name: 'Задачи из переписки', description: 'Создаёт задачи из писем и сообщений', status: 'launched', changedDaysAgo: 35, launchedDaysAgo: 35 },
    { agent: 'tasks', name: 'Напоминания о сроках', description: 'Напоминает исполнителю о близком дедлайне', status: 'rework', changedDaysAgo: 3 },
    { agent: 'tasks', name: 'Массовое создание задач', description: 'Создаёт пачку задач по списку из таблицы', status: 'in_dev', changedDaysAgo: 8 },
    { agent: 'meetings', name: 'Протокол встречи', description: 'Собирает решения и задачи по записи созвона', status: 'launched', changedDaysAgo: 18, launchedDaysAgo: 18 },
    { agent: 'meetings', name: 'Итоги встречи', description: 'Рассылает участникам итоги и ссылки', status: 'testing', changedDaysAgo: 1, launchedDaysAgo: 22 },
    { agent: 'meetings', name: 'Расшифровка голосовых', description: 'Переводит голосовые сообщения в текст', status: 'planned', changedDaysAgo: 5 },
    { agent: 'prices', name: 'Поиск цены по программе', description: 'Находит актуальную цену программы обучения', status: 'launched', changedDaysAgo: 60, launchedDaysAgo: 60 },
    { agent: 'prices', name: 'Сравнение тарифов', description: 'Сравнивает тарифы двух программ', status: 'planned', changedDaysAgo: 9 },
    { agent: 'deal-audit', name: 'Аудит сделки', description: 'Проверяет сделку по чек-листу качества', status: 'launched', changedDaysAgo: 45, launchedDaysAgo: 45 },
    { agent: 'deal-audit', name: 'Подсказки по возражениям', description: 'Подсказывает ответ менеджеру во время звонка', status: 'in_dev', changedDaysAgo: 7 },
    { agent: 'deal-audit', name: 'Карточка клиента', description: 'Собирает сводку по клиенту из CRM', status: 'testing', changedDaysAgo: 2 },
    { agent: 'telegram-tasks', name: 'Задачи голосом', description: 'Создаёт задачу из голосового сообщения', status: 'in_dev', changedDaysAgo: 4 },
    { agent: 'call-analytics', name: 'Оценка звонка', description: 'Оценивает звонок по скрипту продаж', status: 'planned', changedDaysAgo: 3 },
    { agent: 'legacy-reports', name: 'Еженедельный отчёт', description: 'Отчёт по задачам за неделю в старом формате', status: 'launched', changedDaysAgo: 90, launchedDaysAgo: 90 },
];

const REQUESTS = [
    { author: 'user1', title: 'Сводка созвонов с клиентами', description: 'После каждого созвона трачу полчаса на конспект. Хочу короткое резюме автоматически.', frequency: [5, 'week'], minutes: 30, people: 12, skill: 'Сводка встречи', daysAgo: 45 },
    { author: 'user2', title: 'Дайджест просроченных задач', description: 'Руководителю нужен ежедневный список просрочек по отделу.', frequency: [1, 'day'], minutes: 15, people: 4, skill: 'Дайджест просрочек', daysAgo: 33 },
    { author: 'user11', title: 'Протокол по записи встречи', description: 'Нужен протокол с решениями и ответственными по записи встречи.', frequency: [3, 'week'], minutes: 40, people: 8, skill: 'Протокол встречи', daysAgo: 21 },
    { author: 'manager1', title: 'Подсказки при возражениях клиента', description: 'Во время звонка не всегда вспоминаешь ответ на возражение.', frequency: [20, 'day'], minutes: 2, people: 30, skill: 'Подсказки по возражениям', daysAgo: 12 },
    { author: 'user1', title: 'Черновики ответов клиентам', description: 'Много типовых писем, хочу получать черновик ответа.', frequency: [10, 'day'], minutes: 5, people: 6, skill: 'Черновик письма', daysAgo: 9 },
    { author: 'user2', title: 'Сверка актов с поставщиками', description: 'Каждый месяц вручную сверяю акты из 1С с таблицами.', frequency: [1, 'month'], minutes: 240, people: 2, skill: 'Сверка актов', daysAgo: 3 },
    { author: 'user11', title: 'Итоги встречи участникам', description: 'Хочу, чтобы итоги уходили всем участникам сразу после встречи.', frequency: [3, 'week'], minutes: 10, people: 8, skill: 'Итоги встречи', daysAgo: 25 },
    { author: 'manager1', title: 'Автоматический перевод на английский', description: 'Переводить письма иностранным партнёрам.', frequency: [2, 'week'], minutes: 20, people: 3, reject: 'Уже есть в Ассистенте: навык «Черновик письма» умеет писать на английском.', daysAgo: 15 },
    { author: 'user1', title: 'Генерация презентаций', description: 'Собирать презентацию по итогам квартала.', frequency: [1, 'month'], minutes: 180, people: 2, reject: 'Не входит в задачи департамента в этом квартале, вернёмся позже.', daysAgo: 30 },
    { author: 'user2', title: 'Оценка качества звонков', description: 'Нужна автоматическая оценка звонков по скрипту.', frequency: [50, 'day'], minutes: 3, people: 10, daysAgo: 2 },
    { author: 'user11', title: 'Напоминание о днях рождения коллег', description: 'Чтобы не забывать поздравить коллег.', frequency: [1, 'week'], minutes: 5, people: 40, daysAgo: 1 },
    { author: 'manager1', title: 'Сводка по сделке перед звонком', description: 'Перед звонком хочу видеть историю клиента одной карточкой.', frequency: [15, 'day'], minutes: 4, people: 25, daysAgo: 0 },
];

const DEVELOPER_LOGIN = 'user10';

async function seed(client) {
    const counts = { products: 0, agents: 0, links: 0, skills: 0, requests: 0 };

    for (const product of PRODUCTS) {
        const inserted = await client.query(
            'INSERT INTO portal_products (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
            [product.slug, product.name],
        );
        counts.products += inserted.rowCount;
    }
    const productRows = await client.query('SELECT id, slug FROM portal_products');
    const productIdBySlug = new Map(productRows.rows.map((row) => [row.slug, row.id]));

    for (const agent of AGENTS) {
        const archivedAt = agent.archivedDaysAgo === undefined ? null : daysAgo(agent.archivedDaysAgo);
        const inserted = await client.query(
            'INSERT INTO portal_agents (slug, name, archived_at) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
            [agent.slug, agent.name, archivedAt],
        );
        counts.agents += inserted.rowCount;
    }
    const agentRows = await client.query('SELECT id, slug FROM portal_agents');
    const agentIdBySlug = new Map(agentRows.rows.map((row) => [row.slug, row.id]));

    for (const agent of AGENTS) {
        for (const productSlug of agent.products) {
            const inserted = await client.query(
                'INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [agentIdBySlug.get(agent.slug), productIdBySlug.get(productSlug)],
            );
            counts.links += inserted.rowCount;
        }
    }

    for (const skill of SKILLS) {
        const changedAt = daysAgo(skill.changedDaysAgo);
        const inserted = await client.query(
            `INSERT INTO portal_skills (agent_id, name, description, status, created_at, status_changed_at, launched_at, archived_at)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8
             WHERE NOT EXISTS (SELECT 1 FROM portal_skills WHERE agent_id = $1 AND name = $2)`,
            [
                agentIdBySlug.get(skill.agent),
                skill.name,
                skill.description,
                skill.status,
                daysAgo(Math.max(skill.changedDaysAgo, skill.launchedDaysAgo ?? 0) + 10),
                changedAt,
                skill.launchedDaysAgo === undefined ? null : daysAgo(skill.launchedDaysAgo),
                skill.archivedDaysAgo === undefined ? null : daysAgo(skill.archivedDaysAgo),
            ],
        );
        counts.skills += inserted.rowCount;
    }
    const skillRows = await client.query('SELECT id, name FROM portal_skills');
    const skillIdByName = new Map(skillRows.rows.map((row) => [row.name, row.id]));

    const userRows = await client.query('SELECT id, login FROM auth_users');
    const userIdByLogin = new Map(userRows.rows.map((row) => [row.login, row.id]));
    const developerId = userIdByLogin.get(DEVELOPER_LOGIN);
    if (developerId === undefined) throw new Error(`User ${DEVELOPER_LOGIN} not found`);

    for (const request of REQUESTS) {
        const authorId = userIdByLogin.get(request.author);
        if (authorId === undefined) {
            process.stderr.write(`skip request "${request.title}": user ${request.author} not found\n`);
            continue;
        }
        const createdAt = daysAgo(request.daysAgo);
        const decision = request.skill !== undefined ? 'accepted' : request.reject !== undefined ? 'rejected' : 'pending';
        const skillId = request.skill === undefined ? null : skillIdByName.get(request.skill);
        const isDecided = decision !== 'pending';
        const inserted = await client.query(
            `INSERT INTO portal_requests (author_id, title, description, frequency_count, frequency_period,
                 minutes_per_run, people_count, decision, skill_id, reject_reason, decided_by, decided_at, created_at)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
             WHERE NOT EXISTS (SELECT 1 FROM portal_requests WHERE author_id = $1 AND title = $2)`,
            [
                authorId,
                request.title,
                request.description,
                request.frequency[0],
                request.frequency[1],
                request.minutes,
                request.people,
                decision,
                skillId,
                request.reject ?? null,
                isDecided ? developerId : null,
                isDecided ? new Date(createdAt.getTime() + DAY_MS / 2) : null,
                createdAt,
            ],
        );
        counts.requests += inserted.rowCount;
    }
    return counts;
}

const connectionString = process.env.POSTGRES_URL;
if (connectionString === undefined) {
    process.stderr.write('seed:portal-demo failed: POSTGRES_URL is not set\n');
    process.exit(1);
}
const client = new pg.Client({ connectionString });
let code = 1;
try {
    await client.connect();
    await client.query('BEGIN');
    const counts = await seed(client);
    await client.query('COMMIT');
    process.stdout.write(
        `created: products ${counts.products}, agents ${counts.agents}, links ${counts.links}, skills ${counts.skills}, requests ${counts.requests}\n`,
    );
    code = 0;
} catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    process.stderr.write(`seed:portal-demo failed: ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
    await client.end();
}
process.exit(code);
