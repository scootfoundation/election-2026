import 'react'
// Allow CSS custom properties (e.g. style={{ '--c': color }}) in React style objects.
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}
