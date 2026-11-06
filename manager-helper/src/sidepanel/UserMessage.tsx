import { MessagePrimitive } from '@assistant-ui/react'

/** Question of the user: red bubble on the right (User Message in the UI kit). */
export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end">
      <div className="max-w-[85%] rounded-2xl bg-brand-red px-3.5 py-2.5 text-sm leading-[1.4] break-words whitespace-pre-wrap text-white">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}
