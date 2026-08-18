import { Button } from '../ui/Button';
import { SearchInput } from '../ui/SearchInput';
import { useLocation } from 'react-router-dom';

interface AppHeaderProps {
  appName: string;
  userName: string;
  onToggleNav: () => void;
  onLogout: () => void;
}

export function AppHeader({ appName, userName, onToggleNav, onLogout }: AppHeaderProps) {
  const location = useLocation();
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'U';
  const pageTitle = getPageTitle(location.pathname);
  const userEmail = userName.includes('@') ? userName : `${userName.toLowerCase().replace(/\s+/g, '')}@gmail.com`;

  return (
    <header className="sticky top-0 z-[70] border-b border-[var(--color-border)] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1480px] grid-cols-[minmax(210px,248px)_1fr_auto] items-center gap-3 px-3 py-3 sm:px-4 lg:px-5 xl:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button className="md:hidden" variant="ghost" size="sm" onClick={onToggleNav} aria-label="Open navigation">
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
              <path d="M2.5 5.75A.75.75 0 0 1 3.25 5h13.5a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Zm0 4.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 1 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Zm.75 3.5a.75.75 0 0 0 0 1.5h8a.75.75 0 1 0 0-1.5h-8Z" />
            </svg>
          </Button>
          <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ff5f2e,#ff3f8e,#7a5cff)] text-lg font-bold text-white shadow-[var(--shadow-sm)] sm:flex">
            B
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-subtle)]">{appName}</p>
            <p className="text-sm font-semibold text-[var(--color-ink)]">{pageTitle}</p>
          </div>
        </div>

        <div className="mx-auto hidden w-full max-w-[860px] md:block">
          <SearchInput placeholder="Search templates, festivals, products..." aria-label="Search" />
        </div>

        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button
            type="button"
            aria-label="Notifications"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-ink-muted)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <span className="absolute mt-[-16px] ml-[14px] inline-flex h-2.5 w-2.5 rounded-full bg-[#ff7a18]" />
            <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] stroke-current" fill="none" strokeWidth="1.8">
              <path d="M10 3.5a3 3 0 0 0-3 3v1.1c0 .6-.2 1.19-.58 1.67L5.2 10.9A1.3 1.3 0 0 0 6.22 13h7.56a1.3 1.3 0 0 0 1.02-2.1l-1.22-1.63A2.7 2.7 0 0 1 13 7.6V6.5a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8.5 15a1.75 1.75 0 0 0 3 0" strokeLinecap="round" />
            </svg>
          </button>

          <div className="hidden items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] py-1.5 pl-2 pr-4 shadow-[var(--shadow-xs)] lg:flex">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ff6b3d,#b743ff)] text-sm font-bold text-white">
              {userInitial}
            </span>
            <div className="text-left leading-none">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{userName}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">{userEmail}</p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={onLogout} className="h-11 w-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] px-0 text-[var(--color-ink-muted)] shadow-[var(--shadow-xs)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]" aria-label="Logout">
            <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] stroke-current" fill="none" strokeWidth="1.8">
              <path d="M7.5 4.5H5.8A1.8 1.8 0 0 0 4 6.3v7.4a1.8 1.8 0 0 0 1.8 1.8h1.7" strokeLinecap="round" />
              <path d="M11 6.5 15 10l-4 3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 10H7.5" strokeLinecap="round" />
            </svg>
          </Button>
        </div>
      </div>
    </header>
  );
}

function getPageTitle(pathname: string) {
  if (pathname.includes('/ai-studio')) return 'AI Studio';
  if (pathname.includes('/ai-generation-history')) return 'AI Gen History';
  if (pathname.includes('/frames')) return 'Frames';
  if (pathname.includes('/categories')) return 'Categories';
  if (pathname.includes('/projects')) return 'Projects';
  if (pathname.includes('/wallet')) return 'Wallet';
  if (pathname.includes('/settings')) return 'Settings';
  return 'Home';
}
