# Модуль tasks

Задачи и вложения к ним. Слои: `domain` (сущности, порты), `application` (use cases), `infrastructure` (Slonik, диск, JWT), `interface` (HTTP, агент).

## Вложения задач

| Метод и путь | Доступ | Описание |
|---|---|---|
| `POST /tasks/:id/attachments` | Bearer | загрузка файла (multipart, поле `file`) |
| `GET /tasks/:id/attachments/:attachmentId` | Bearer | скачивание с заголовком Authorization |
| `POST /tasks/:id/attachments/:attachmentId/download-link` | Bearer | подписанная ссылка `{ url, expiresAt }` |
| `GET /tasks/:id/attachments/:attachmentId/content?token=` | публичный | скачивание по ссылке |
| `DELETE /tasks/:id/attachments/:attachmentId` | Bearer | удаление вложения и файла |

### Подписанная ссылка

Для клиентов, которые не умеют слать Authorization при скачивании (например `chrome.downloads`).

1. Клиент вызывает `POST .../download-link`. Нужно право чтения задачи (`TaskAccessPolicy.canRead`), иначе та же ошибка, что у обычного скачивания.
2. Ответ: `url` вида `/tasks/{id}/attachments/{attachmentId}/content?token=…` (относительный, клиент добавляет адрес backend) и `expiresAt`.
3. `GET .../content?token=` открыт без Authorization. Ответ: `Content-Disposition: attachment` с исходным именем, сохранённый `Content-Type`, `X-Content-Type-Options: nosniff`.

Токен: JWT HS256, `aud: 'task-attachment'`, `sub` равен id вложения. Адаптер `JwtAttachmentDownloadToken` (порт `AttachmentDownloadTokenPort`) не зависит от модуля `files`. Токен файла чата (`aud: 'file-download'`) не подходит, даже при общем секрете.

Настройки (`env.schema.ts`):
- `FILES_DOWNLOAD_TOKEN_SECRET` (необязательная, не короче 32 символов). Без неё выдача ссылок выключена.
- `FILES_DOWNLOAD_LINK_TTL_SEC` (по умолчанию 300).

Ошибки:

| Статус | Код | Когда |
|---|---|---|
| 403 | `TASK_ATTACHMENT_TOKEN_INVALID` | токен просрочен, подделан, чужого вложения или с другим `aud` |
| 404 | `TASK_NOT_FOUND`, `TASK_ATTACHMENT_NOT_FOUND` | задачи нет, вложение не из этой задачи, вложение или файл удалены |
| 503 | `TASK_ATTACHMENT_LINKS_UNAVAILABLE` | не задан `FILES_DOWNLOAD_TOKEN_SECRET` |
