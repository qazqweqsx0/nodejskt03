# КТ-03 — REST API блог-платформы

REST API блог-платформы на **Node.js + Express + Prisma ORM**. В качестве СУБД по умолчанию
используется **SQLite** (отдельный сервер не нужен), при этом проект без изменений кода
переключается на **PostgreSQL** — см. раздел «PostgreSQL».

Реализовано управление пользователями, постами и тегами со связями «один ко многим»
(`User → Post`) и «многие ко многим» (`Post ↔ Tag`), пагинация, поиск, фильтрация,
валидация входных данных через Joi и централизованная обработка ошибок.

## Стек

| Компонент | Версия/назначение |
| --- | --- |
| Node.js | >= 18 |
| Express | 4.x, HTTP-слой |
| Prisma ORM | 6.x, доступ к БД и миграции |
| SQLite | файл `prisma/dev.db` (по умолчанию) |
| Joi | валидация body/query/params |
| morgan / cors | логирование запросов, CORS |

## Структура проекта

```
kt03/
├── prisma/
│   ├── schema.prisma          # модели User, Post, Tag + enum Role
│   └── migrations/            # SQL-миграции (init)
├── src/
│   ├── config/
│   │   └── index.js           # чтение .env, порт, лимиты пагинации
│   ├── middleware/
│   │   ├── validate.js        # Joi-middleware (body / query / params)
│   │   └── errorHandler.js    # ApiError, asyncHandler, 404 и маппинг ошибок Prisma
│   ├── routes/
│   │   ├── users.js           # /api/users
│   │   └── posts.js           # /api/posts
│   └── index.js               # точка входа: Express-приложение и запуск сервера
├── .env                       # локальные переменные окружения (не коммитится)
├── .env.example               # шаблон .env
├── .gitignore
├── package.json
└── README.md
```

## Быстрый старт

```bash
cd kt03
npm install

# Windows (PowerShell)
Copy-Item .env.example .env
# Linux / macOS
# cp .env.example .env

npx prisma generate          # генерация Prisma Client
npx prisma migrate dev       # применение миграций, создание prisma/dev.db
npm start                    # http://localhost:3000
```

Для разработки с автоперезапуском: `npm run dev`.

Полезные скрипты:

| Команда | Действие |
| --- | --- |
| `npm start` | запуск API |
| `npm run dev` | запуск с `node --watch` |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:deploy` | применение готовых миграций (production) |
| `npm run prisma:studio` | Prisma Studio (GUI для БД) |
| `npm run prisma:reset` | сброс БД и повторное применение миграций |

> Если при `npm install` политика npm пропускает install-скрипты, Prisma Client нужно
> сгенерировать вручную: `npx prisma generate` (команда уже есть в списке шагов выше).

## Переменные окружения

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `NODE_ENV` | `development` | окружение |
| `PORT` | `3000` | порт HTTP-сервера |
| `DATABASE_URL` | `file:./dev.db` | строка подключения Prisma (путь к SQLite-файлу относительно `prisma/`) |
| `DEFAULT_PAGE` | `1` | страница по умолчанию для пагинации |
| `DEFAULT_LIMIT` | `10` | размер страницы по умолчанию |
| `MAX_LIMIT` | `100` | максимальный `limit` |

Если `DATABASE_URL` не задан, приложение завершается с понятным сообщением об ошибке.

## API

Базовый URL: `http://localhost:3000`. Все ответы — JSON в конверте `{ "data": ... }`,
списки дополнительно содержат `meta`.

### Пользователи

| Метод | URL | Описание |
| --- | --- | --- |
| GET | `/api/users?page=1&limit=10` | список с пагинацией |
| GET | `/api/users/:id` | пользователь вместе с постами |
| POST | `/api/users` | создать пользователя |
| PATCH | `/api/users/:id` | обновить пользователя |
| DELETE | `/api/users/:id` | удалить пользователя |

**GET /api/users** — ответ:

```json
{
  "data": [
    {
      "id": 1,
      "email": "alice@example.com",
      "name": "Alice",
      "role": "USER",
      "createdAt": "2026-11-25T10:00:00.000Z",
      "_count": { "posts": 2 }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10, "pages": 1 }
}
```

**GET /api/users/:id** — пользователь с постами, посты отсортированы по `createdAt` по убыванию:

```json
{
  "data": {
    "id": 1,
    "email": "alice@example.com",
    "name": "Alice",
    "role": "USER",
    "createdAt": "2026-11-25T10:00:00.000Z",
    "posts": [
      { "id": 2, "title": "Второй пост", "content": null, "published": false, "createdAt": "...", "authorId": 1, "tags": [] },
      { "id": 1, "title": "Первый пост", "content": "...", "published": true, "createdAt": "...", "authorId": 1, "tags": [{ "id": 1, "name": "node" }] }
    ]
  }
}
```

**POST /api/users** — поля: `email` (обязательно, валидный e-mail), `name` (обязательно),
`role` (`USER` | `ADMIN`, по умолчанию `USER`).

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","name":"Alice"}'
```

**PATCH /api/users/:id** — принимает любое подмножество `email`, `name`, `role`
(пустой объект отклоняется с 400).

**DELETE /api/users/:id** — `204 No Content`; посты пользователя удаляются каскадно.

### Посты

| Метод | URL | Описание |
| --- | --- | --- |
| GET | `/api/posts` | список с поиском, фильтрацией и пагинацией |
| GET | `/api/posts/:id` | пост с автором и тегами |
| POST | `/api/posts` | создать пост |
| PATCH | `/api/posts/:id` | обновить пост |
| DELETE | `/api/posts/:id` | удалить пост |

**GET /api/posts** — query-параметры:

| Параметр | Описание |
| --- | --- |
| `search` | поиск по заголовку: `contains`, без учёта регистра |
| `published` | `true` / `false` — фильтр по статусу публикации |
| `authorId` | фильтр по автору |
| `page` | номер страницы (по умолчанию `1`) |
| `limit` | размер страницы (по умолчанию `10`, максимум `100`) |

Пример: `GET /api/posts?search=prisma&published=true&authorId=1&page=1&limit=5`

```json
{
  "data": [
    {
      "id": 1,
      "title": "Hello Prisma",
      "content": "Текст поста",
      "published": true,
      "createdAt": "2026-11-25T10:00:00.000Z",
      "authorId": 1,
      "author": { "id": 1, "email": "alice@example.com", "name": "Alice", "role": "USER" },
      "tags": [{ "id": 1, "name": "prisma" }, { "id": 2, "name": "node" }]
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 5, "pages": 1 }
}
```

**POST /api/posts** — поля: `title` (обязательно), `content` (необязательно),
`published` (по умолчанию `false`), `authorId` (обязательно, число), `tags` (массив строк).
Теги создаются через `connectOrCreate`: существующий тег переиспользуется, новый — создаётся.

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello Prisma","content":"Текст","published":true,"authorId":1,"tags":["node","prisma"]}'
```

**PATCH /api/posts/:id** — частичное обновление. Если передан `tags`, он **заменяет** текущий
набор тегов (`tags: []` очищает теги). Ответ — `200` с обновлённым постом, включая автора и теги.

**DELETE /api/posts/:id** — `204 No Content`.

### Служебные

| Метод | URL | Описание |
| --- | --- | --- |
| GET | `/health` | проверка работоспособности |
| GET | `/` | краткая информация о сервисе и ссылки на разделы |

## Валидация и ошибки

Валидация выполняется Joi в middleware `src/middleware/validate.js`
(`stripUnknown: true`, `convert: true`, `abortEarly: false`). Ошибки возвращаются в виде:

```json
{
  "error": {
    "status": 400,
    "message": "Ошибка валидации",
    "details": [
      { "path": "title", "message": "\"title\" is required" },
      { "path": "authorId", "message": "\"authorId\" must be a number" }
    ]
  }
}
```

| Код | Когда возникает |
| --- | --- |
| `400` | ошибка валидации Joi, некорректный JSON, несуществующий `authorId` |
| `404` | запись или маршрут не найдены |
| `409` | конфликт уникальности (`email` пользователя, `name` тега) |
| `500` | непредвиденная ошибка сервера |

Коды ошибок Prisma (`P2002` — уникальность, `P2003` — внешний ключ, `P2025` — запись не найдена)
централизованно преобразуются в `ApiError` в `src/middleware/errorHandler.js`.

## Особенности реализации

- **Единый экземпляр `PrismaClient`** создаётся в `src/index.js` и передаётся роутам через
  `app.locals.prisma`; при остановке процесса соединение закрывается (`SIGINT` / `SIGTERM`).
- **Каскадное удаление**: `Post.author` объявлен с `onDelete: Cascade`, поэтому удаление
  пользователя удаляет и его посты; связи постов с тегами чистятся каскадно на уровне БД.
- **Регистронезависимый поиск**: в PostgreSQL используется `mode: 'insensitive'`
  (`config.isPostgres`); в SQLite `LIKE` не различает регистр для ASCII-символов, поэтому
  опция не передаётся (Prisma не поддерживает `mode` для SQLite).
- **Сортировка**: посты в списках и в карточке пользователя — по `createdAt` по убыванию,
  при равенстве дат — по `id` по убыванию (стабильный порядок).

## PostgreSQL

1. В `prisma/schema.prisma` замените `provider = "sqlite"` на `provider = "postgresql"`.
2. В `.env` укажите, например:
   `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kt03?schema=public"`
3. Пересоздайте миграцию под PostgreSQL и примените её:

   ```bash
   rm -rf prisma/migrations
   npx prisma migrate dev --name init
   npx prisma generate
   ```

Код приложения менять не нужно: поиск автоматически включит `mode: 'insensitive'`
(см. `config.isPostgres`).
