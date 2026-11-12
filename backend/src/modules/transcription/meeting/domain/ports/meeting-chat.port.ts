export interface RecordingOfOwner {
    readonly ownerId: string;
    readonly fileId: string;
}

/** О чём сообщение: по этому выбирается тип уведомления. */
export type MeetingChatTopic = 'meeting-transcript.ready' | 'meeting-transcript.failed';

/** Сообщение ассистента о результате расшифровки, без запроса пользователя. */
export interface MeetingChatMessage {
    readonly chatId: string;
    readonly ownerId: string;
    readonly text: string;
    /** Файлы владельца под сообщением, по порядку. */
    readonly attachments: readonly string[];
    /** Повтор с тем же ключом ничего не добавляет. */
    readonly dedupKey: string;
    readonly topic: MeetingChatTopic;
    readonly recording: { readonly fileId: string; readonly fileName: string };
}

/** Чат, куда отправили запись, и доставка туда сообщения ассистента. */
export abstract class MeetingChatPort {
    /** Первый существующий чат владельца, куда отправили запись; `null` — такого нет. */
    abstract findChatOfRecording(input: RecordingOfOwner): Promise<string | null>;

    /** Асинхронно: сообщение ждёт окончания текущего ответа в чате. */
    abstract post(message: MeetingChatMessage): Promise<void>;
}
