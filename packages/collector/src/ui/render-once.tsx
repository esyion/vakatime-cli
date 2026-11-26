// One-shot Ink render: paint a static panel, give it two frames to flush,
// then unmount so the process can exit. Only imported by commands that have
// already decided to use Ink (dynamic import site keeps the hook path light).
import { render } from 'ink'
import type { ReactElement } from 'react'

export function renderOnce(node: ReactElement): Promise<void> {
  return new Promise((resolve) => {
    const instance = render(node)
    setTimeout(() => {
      instance.unmount()
      resolve()
    }, 50)
  })
}
