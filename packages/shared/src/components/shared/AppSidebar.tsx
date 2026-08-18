import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';

interface SidebarLink {
  to: string;
  label: string;
}

type ThemeMode = 'light' | 'dark' | 'system';

interface AppSidebarProps {
  links: SidebarLink[];
  open?: boolean;
  onNavigate?: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export function AppSidebar({ links, open = false, onNavigate, themeMode, onThemeModeChange }: AppSidebarProps) {
  return (
    <>
      <aside className="hidden h-[calc(100vh-92px)] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 shadow-[var(--shadow-xs)] md:sticky md:top-[78px] md:z-[70] md:block">
        <SidebarContent links={links} onNavigate={onNavigate} themeMode={themeMode} onThemeModeChange={onThemeModeChange} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-[var(--z-modal)] bg-[rgba(9,12,18,0.45)] p-4 md:hidden" onClick={onNavigate}>
          <aside className="h-full w-[84%] max-w-[320px] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 shadow-[var(--shadow-lg)]" onClick={event => event.stopPropagation()}>
            <SidebarContent links={links} onNavigate={onNavigate} themeMode={themeMode} onThemeModeChange={onThemeModeChange} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function SidebarContent({
  links,
  onNavigate,
  themeMode,
  onThemeModeChange,
}: {
  links: SidebarLink[];
  onNavigate?: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}) {
  const workspaceLinks = links.slice(0, 6);
  const accountLinks = links.slice(6);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 shadow-[var(--shadow-xs)]">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ff5f2e,#ff3f8e,#7a5cff)] text-lg font-bold text-white shadow-[var(--shadow-sm)]">
            B
          </div>
          <div>
            <p className="text-lg font-bold leading-none text-[var(--color-ink)]">BrandPilot</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">Design Studio</p>
          </div>
        </div>

        <Button className="mt-4 h-12 w-full rounded-[16px] border-0 bg-[linear-gradient(135deg,#ff6a22,#f23686_56%,#5f68ea)] text-white shadow-[0_18px_38px_rgba(138,52,182,0.22)] hover:opacity-95" onClick={onNavigate}>
          + Create design
        </Button>
      </div>

      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-subtle)]">Workspace</p>
      <nav className="mt-2 space-y-1">
        {workspaceLinks.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-[18px] px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[linear-gradient(120deg,#fff3ec,#ffe6f5)] text-[#e05a21] before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[#ff7a18]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
              )
            }
          >
            <span className="nav-flag inline-flex h-5 w-5 items-center justify-center text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
              {getSidebarIcon(link.label)}
            </span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <p className="mt-5 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-subtle)]">Account</p>
      <nav className="mt-2 space-y-1">
        {accountLinks.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-[18px] px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[linear-gradient(120deg,#fff3ec,#ffe6f5)] text-[#e05a21] before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[#ff7a18]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
              )
            }
          >
            <span className="nav-flag inline-flex h-5 w-5 items-center justify-center text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
              {getSidebarIcon(link.label)}
            </span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-[18px] bg-[var(--color-surface-2)] p-2">
          <div className="grid grid-cols-3 gap-1 text-xs">
            {(['light', 'dark', 'system'] as ThemeMode[]).map(mode => {
              const isActive = themeMode === mode;
              return (
                <button
                  key={mode}
                  className={cn(
                    'inline-flex items-center justify-center gap-1 rounded-[12px] border px-2 py-2 capitalize transition',
                    isActive
                      ? 'border-transparent bg-[#ff6b2f] text-white'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-3)]',
                  )}
                  type="button"
                  onClick={() => onThemeModeChange(mode)}
                  aria-pressed={isActive}
                >
                  {getThemeIcon(mode)}
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-surface-2)] px-4 text-sm font-medium text-[var(--color-ink-muted)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.8">
            <path d="M12.5 5.5 8 10l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Collapse
        </button>
      </div>
    </div>
  );
}

function getSidebarIcon(label: string) {
  const className = 'h-[18px] w-[18px] stroke-current';

  switch (label) {
    case 'Home':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <path d="M3.5 8.5 10 3l6.5 5.5V16a1 1 0 0 1-1 1h-3.75v-4.5h-3.5V17H4.5a1 1 0 0 1-1-1V8.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Frames':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" />
          <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" />
          <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" />
          <rect x="11" y="11" width="5.5" height="5.5" rx="1.2" />
        </svg>
      );
    case 'Categories':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <path d="M4 5.5h12M4 10h12M4 14.5h12" strokeLinecap="round" />
          <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="5.5" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="5.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'AI Studio':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <path d="m10 3 1.4 3.6L15 8l-3.6 1.4L10 13l-1.4-3.6L5 8l3.6-1.4L10 3Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m15.5 13.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'AI Gen History':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <path d="M10 5v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 10a6 6 0 1 1-1.76-4.24" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 4.5v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Projects':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <path d="M4.5 5.5h4l1.2 1.7h5.8a1 1 0 0 1 1 1V14.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Wallet':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <rect x="3" y="5" width="14" height="10" rx="2" />
          <path d="M13 10h2.5" strokeLinecap="round" />
        </svg>
      );
    case 'Settings':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <path d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m16 10 1.2-.7-.8-2-1.4.1a5.9 5.9 0 0 0-1-1l.1-1.4-2-.8L11.5 5a5.9 5.9 0 0 0-1.5 0L9.3 3.6l-2 .8.1 1.4a5.9 5.9 0 0 0-1 1L5 6.7l-.8 2L5.4 10l-1.2.7.8 2 1.4-.1a5.9 5.9 0 0 0 1 1l-.1 1.4 2 .8.7-1.2a5.9 5.9 0 0 0 1.5 0l.7 1.2 2-.8-.1-1.4a5.9 5.9 0 0 0 1-1l1.4.1.8-2L16 10Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
          <circle cx="10" cy="10" r="6" />
        </svg>
      );
  }
}

function getThemeIcon(mode: ThemeMode) {
  const className = 'h-3.5 w-3.5 stroke-current';

  if (mode === 'light') {
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
        <circle cx="10" cy="10" r="3.2" />
        <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (mode === 'dark') {
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
        <path d="M14.8 12.8A5.8 5.8 0 0 1 7.2 5.2a6.3 6.3 0 1 0 7.6 7.6Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" strokeWidth="1.8">
      <rect x="3.5" y="4" width="13" height="9" rx="1.8" />
      <path d="M7.5 16h5" strokeLinecap="round" />
    </svg>
  );
}
