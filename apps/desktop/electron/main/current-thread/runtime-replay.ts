import type { RuntimeChatStateClient } from '../runtime/chat-state-client'
import type { CurrentThreadRecordV1 } from './schemas'

export async function replayCurrentThread(
  client: RuntimeChatStateClient,
  record: CurrentThreadRecordV1 | null,
) {
  for (const turn of record?.turns ?? []) {
    await client.submitUserMessage({
      turnRequestId: turn.attemptRequestId,
      userMessageId: turn.userMessageId,
      assistantMessageId: turn.assistantMessageId,
      content: turn.userContent,
    })
    await client.startAssistant({
      turnRequestId: turn.attemptRequestId,
      assistantMessageId: turn.assistantMessageId,
    })

    if (turn.assistantContent.length > 0) {
      await client.appendDelta({
        turnRequestId: turn.attemptRequestId,
        assistantMessageId: turn.assistantMessageId,
        snapshot: turn.assistantContent,
      })
    }

    const finishTurn = {
      turnRequestId: turn.attemptRequestId,
      assistantMessageId: turn.assistantMessageId,
      finalContent: turn.assistantContent,
    }

    switch (turn.assistantStatus) {
      case 'completed':
        await client.complete(finishTurn)
        break

      case 'cancelled':
        await client.cancel(finishTurn)
        break

      case 'failed':
        await client.fail({
          turnRequestId: turn.attemptRequestId,
          assistantMessageId: turn.assistantMessageId,
          message: turn.error!.message,
        })
        break

      case 'pending':
        throw new Error('Pending turns must not be replayed before the current runtime action.')
    }
  }
}
