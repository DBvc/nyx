import { useEffect, useRef, useState } from 'react'
import type { UIEvent } from 'react'

export function nextFollowingAfterScroll(
  isFollowing: boolean,
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
) {
  return isFollowing && scrollHeight - scrollTop - clientHeight < 64
}

export function useAutoScroll(
  messageCount: number,
  latestMessageContent: string,
  projectionGeneration: number,
  isChatActive: boolean,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const followingRef = useRef(true)
  const [isFollowing, setIsFollowing] = useState(true)

  useEffect(() => {
    if (!isChatActive) {
      return
    }

    followingRef.current = true
    setIsFollowing(true)

    const container = containerRef.current

    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [isChatActive, projectionGeneration])

  useEffect(() => {
    const container = containerRef.current

    if (!isChatActive || !container || !followingRef.current) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [isChatActive, latestMessageContent, messageCount])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
    const nextFollowing = nextFollowingAfterScroll(
      followingRef.current,
      scrollHeight,
      scrollTop,
      clientHeight,
    )

    if (nextFollowing === followingRef.current) {
      return
    }

    followingRef.current = nextFollowing
    setIsFollowing(nextFollowing)
  }

  function followLatest() {
    followingRef.current = true
    setIsFollowing(true)

    const container = containerRef.current

    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }

  return {
    containerRef,
    followLatest,
    handleScroll,
    isFollowing,
  }
}
