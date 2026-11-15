# Architecture: transcribe-compressed-meetings-whole-file

## Scope

Изменяется только серверная обработка записи встречи внутри `backend/src/modules/transcription/meeting`. Контракты загрузки файла, очереди, сохранённой расшифровки, HTTP API и чата остаются прежними.

---

## Backend — Domain Model

### Entities

| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `MeetingTranscript` | existing | да | `fileId`, статус, язык, длительность, число спикеров | Управляет жизненным циклом расшифровки и событиями |
| `TranscriptSegment` | existing | нет; хранится отдельно от агрегата | `seq`, `speaker`, `startSec`, `endSec`, `text` | Реплика из единого ответа STT |

### Aggregates

| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| Расшифровка встречи | `MeetingTranscript` | статус и `SpeakerNames`; сегменты сохраняются в той же транзакции через отдельный репозиторий | Завершение и публикация события однократны; готовая расшифровка не меняет текст сегментов |

### Value Objects

| Name | Поля | Почему VO |
|---|---|---|
| `DiarizedTranscript` (existing) | язык, длительность, упорядоченные сегменты | Валидирует единый результат распознавания до записи в БД |
| `SpeakerNames` (existing) | номер спикера → назначенное имя | Неизменяемое отображение имён, независимо от STT |

Новых доменных сущностей и VO не требуется: сжатый файл — временный инфраструктурный объект, а не часть предметной модели.

### Services

| Service | Слой | Ответственность |
|---|---|---|
| `TranscribeMeetingUseCase` (existing) | application | Статусы, удержание записи, повторы, атомарное сохранение результата и события |
| `MeetingTranscriberPort` (existing) | domain port | Контракт распознавания целой записи |
| `WholeFileMeetingTranscriber` (new) | infrastructure | Скачивание во временную папку, вызов подготовки и STT, сборка результата, очистка |
| `MeetingAudioPreparerPort` / ffmpeg adapter (new) | domain port / infrastructure | Проверка входа и кодирование всей дорожки в один OGG |
| `WholeFileSttPort` / ElevenLabs adapter (new) | domain port / infrastructure | Один запрос к Scribe v2 и проверка структуры ответа |

### Method Signatures

| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `TranscribeMeetingUseCase.execute` | `{ fileId, isFinalAttempt, deadline }` | `Promise<void>` | Запускает одну попытку и фиксирует статус |
| `MeetingTranscriberPort.transcribe` | `MeetingAudio, AbortSignal` | `Promise<MeetingTranscription>` | Сохраняет прежний контракт модуля |
| `MeetingAudioPreparerPort.prepare` | `inputPath, workDir, AbortSignal` | `Promise<{ path, durationSec, sizeBytes }>` | Создаёт ровно один проверенный сжатый файл |
| `WholeFileSttPort.transcribe` | `preparedAudio, AbortSignal` | `Promise<{ language, words, usage? }>` | Отправляет целый файл и возвращает слова и спикеров |

---

## Frontend — UI Model

Изменение не затрагивает frontend: новых страниц, features, компонентов и hooks нет. Существующий экран чата получает те же статусы и документ расшифровки. Правила FSD и `frontend/CLAUDE.md` к этому backend-only change не применяются; такого файла в проекте нет.

### Pages

Нет изменений.

### Features

Нет изменений.

### UI-компоненты

Нет изменений.

### Hooks

Нет изменений.

### Паттерны

Новые frontend-паттерны не применяются.

---

## Diagrams

Три локальные SVG подготовлены для просмотра. Ссылки Miro пока отсутствуют: Miro MCP-инструменты в текущей сессии недоступны.

### 1. Domain Entity Interaction

Локальная диаграмма: [domain.svg](diagrams/domain.svg). `MeetingTranscript` завершает жизненный цикл по валидированному `DiarizedTranscript`; сегменты сохраняются отдельно; `SpeakerNames` принадлежит агрегату.

### 2. External Modules Interaction

Локальная диаграмма: [modules.svg](diagrams/modules.svg). `Files` передаёт поток, очередь запускает воркер, воркер обращается к ElevenLabs и сохраняет сегменты; событие готовности доставляет результат в чат.

### 3. Layer Interaction — from upload to response

Локальная диаграмма: [layers.svg](diagrams/layers.svg). `file.uploaded` → BullMQ processor → `TranscribeMeetingUseCase` → `MeetingTranscriberPort` → подготовка аудио → ElevenLabs → репозитории → `GET /transcripts/:fileId`. Ошибки возвращаются в use case и переводятся в существующие причины сбоя.

---

## Confirmation Checklist

- [ ] Названия entity/aggregate/VO согласованы
- [ ] Названия и сигнатуры ключевых методов сервисов согласованы
- [ ] Отсутствие frontend-изменений согласовано
- [ ] Диаграммы взаимодействия отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к `tasks.md`
