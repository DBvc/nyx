import { useEffect, useRef } from 'react'
import type { UIEvent } from 'react'

export function useAutoScroll(messageCount: number, latestMessageContent: string) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  useEffect(() => {
    const container = containerRef.current

    if (!container || !shouldStickToBottomRef.current) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [latestMessageContent, messageCount])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    shouldStickToBottomRef.current = distanceFromBottom < 64
  }

  return {
    containerRef,
    handleScroll,
  }
}
