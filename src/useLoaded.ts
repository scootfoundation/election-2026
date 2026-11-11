import { useEffect, useState } from 'react'
import { messageOf } from './edge/http'

export type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: T }

/** Run an async loader once (and again if `key` changes) and report its progress as a typed value. */
export function useLoaded<T>(load: () => Promise<T>, key = ''): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    load().then((value) => { if (live) setState({ status: 'ready', value }) }).catch((e) => { if (live) setState({ status: 'error', message: messageOf(e) }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}
