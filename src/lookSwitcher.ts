// Temporary: lets you flip between look-and-feel experiments (see looks.css). Remove once one is chosen.
const LOOKS: [string, string][] = [['', 'Current'], ['a', 'A Paper'], ['b', 'B Ink & rules'], ['c', 'C Soft editorial']]

export function installLookSwitcher(): void {
  const set = (k: string): void => {
    if (k) document.documentElement.dataset.look = k
    else delete document.documentElement.dataset.look
    const u = new URL(location.href)
    if (k) u.searchParams.set('look', k)
    else u.searchParams.delete('look')
    history.replaceState(null, '', u)
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k))
  }
  const box = document.createElement('div')
  box.id = 'look-switch'
  for (const [k, n] of LOOKS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.k = k
    b.textContent = n
    b.onclick = () => set(k)
    box.append(b)
  }
  document.body.append(box)
  set(new URL(location.href).searchParams.get('look') ?? '')
}
