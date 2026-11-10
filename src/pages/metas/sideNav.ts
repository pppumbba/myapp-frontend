/** A side menu entry on the meta pages (the Metas sections, a meta's sections). */
export function sideNavItemClass(current: boolean): string {
  return `flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 ${
    current ? 'bg-active text-secondary_hover ring-1 ring-primary ring-inset' : 'text-secondary hover:bg-primary_hover hover:text-secondary_hover'
  }`;
}
