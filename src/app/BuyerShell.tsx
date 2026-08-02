import { BellRing, FolderOpen, LayoutDashboard, LogOut, Menu, Store, X, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePortfolioStore } from '../store/PortfolioStore';

type BuyerNavItem = readonly [label: string, to: string, icon: LucideIcon];

const buyerNav: readonly BuyerNavItem[] = [
  ['Workspace', '/buyer', LayoutDashboard],
  ['Marketplace', '/buyer/marketplace', Store],
  ['Portfolio Library', '/buyer/library', FolderOpen],
  ['Alerts', '/buyer/alerts', BellRing],
];

function BuyerNavigationLink({ item, onNavigate }: { item: BuyerNavItem; onNavigate: () => void }) {
  const [label, to, Icon] = item;
  return (
    <NavLink
      to={to}
      end={to === '/buyer'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
          isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20' : 'text-slate-300 hover:bg-white/7 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

export default function BuyerShell({ children }: { children: ReactNode }) {
  const { profile } = usePortfolioStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-[#071426] p-5 text-white transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[.24em] text-blue-400">DATA MARKET HOUSE</p>
            <h1 className="mt-2 text-xl font-semibold">Buyer Portal</h1>
            <p className="mt-1 text-xs text-slate-500">Secure transaction workspace · v5.5.0</p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button>
        </div>

        <div className="mb-6 rounded-2xl border border-blue-400/15 bg-blue-400/8 px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-blue-300">Secure buyer access</p>
          <p className="mt-2 text-sm font-semibold text-white">{profile?.full_name || 'Approved buyer'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Documents and portfolio releases remain controlled by transaction gates.</p>
        </div>

        <nav className="space-y-1">
          {buyerNav.map((item) => <BuyerNavigationLink key={item[0]} item={item} onNavigate={() => setOpen(false)} />)}
        </nav>

        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-left text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={17} /> Sign out securely
        </button>
      </aside>

      <main className="lg:pl-72">
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#f4f7fb]/90 px-5 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
          <span className="text-sm font-semibold">DMH Buyer Portal</span>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Secure</span>
        </div>
        {children}
      </main>
    </div>
  );
}
