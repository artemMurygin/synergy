import { HttpAgent } from "@ag-ui/client";
import { BACKEND_ORIGIN, CLIENT_APP, CLIENT_APP_HEADER } from "./client";

/** AG-UI agent bound to a chat: `threadId` is the chat id on every level. */
export function createAgent(threadId: string): HttpAgent {
  return new HttpAgent({
    url: `${BACKEND_ORIGIN}/agent`,
    threadId,
    headers: { [CLIENT_APP_HEADER.toLowerCase()]: CLIENT_APP },
  });
}
