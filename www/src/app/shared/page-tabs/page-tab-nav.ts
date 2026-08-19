/** Keyboard navigation for accessible page tab strips. */
export function onPageTabKeydown<T extends string>(
  event: KeyboardEvent,
  index: number,
  tabOrder: readonly T[],
  select: (id: T) => void,
): void {
  let next = index;
  switch (event.key) {
    case 'ArrowRight':
      next = (index + 1) % tabOrder.length;
      break;
    case 'ArrowLeft':
      next = (index - 1 + tabOrder.length) % tabOrder.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = tabOrder.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  select(tabOrder[next]);
  const target = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(
    '[role="tab"]',
  )[next];
  target?.focus();
}
