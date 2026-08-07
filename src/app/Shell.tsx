import type { LucideIcon } from 'lucide-react';
import {
  ArrowRightLeft,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Columns3,
  FileSignature,
  FileWarning,
  FolderOpen,
  Handshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquareText,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  WalletCards,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  Target,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePortfolioStore } from '../store/PortfolioStore';
import { supabase } from '../lib/supabase';

type NavItem = readonly [label: string, to: string, icon: LucideIcon];

const ownerPrimary: readonly NavItem[] = [
['Command', '/', LayoutDashboard],
['Transactions', '/transactions', Handshake],
['Portfolios', '/portfolios', BriefcaseBusiness],
['Create Portfolio', '/portfolios/new', Plus],
['Agencies', '/agencies', Building2],
['Conversations', '/conversations', MessageSquareText],
['Revenue', '/revenue', CircleDollarSign],
['Employees', '/employees', Users],
['Settings', '/settings/payment', Settings],
]

const ownerAdvanced: readonly NavItem[] = [];

const buyerNav: readonly NavItem[] = [
  ['Workspace', '/buyer', LayoutDashboard],
  ['Marketplace', '/buyer/marketplace', Store],
  ['Portfolio Library', '/buyer/library', FolderOpen],
  ['Alerts', '/buyer/alerts', BellRing],
];

const employeeNav: readonly NavItem[] = [
['Today', '/employee', LayoutDashboard],
['Transactions', '/employee/transactions', Handshake],
['Portfolios', '/employee/portfolio', BriefcaseBusiness],
['Agencies', '/employee/agencies', Building2],
['Messages', '/employee/conversations', MessageSquareText],
['Earnings', '/employee/earnings', WalletCards],
]

function NavigationLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const [label, to, Icon] = item;
  const location = useLocation();
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
          isActive || (to === '/' && location.pathname === '/')
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { profile } = usePortfolioStore();
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const location = useLocation();
  const role = profile?.role === 'owner' ? 'owner' : profile?.role === 'buyer' ? 'buyer' : 'employee';

  const advancedActive = useMemo(
    () => ownerAdvanced.some(([, to]) => location.pathname === to || location.pathname.startsWith(`${to}/`)),
    [location.pathname],
  );

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-[#08101f] p-5 text-white transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[.24em] text-blue-400">DATA MARKET HOUSE</p>
            <h1 className="mt-2 text-xl font-semibold">Sales OS</h1>
            <p className="mt-1 text-xs text-slate-500">NDA Transaction Workspace · v5.5.1</p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
            <X />
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Signed in as</p>
          <p className="mt-1 text-sm font-semibold capitalize text-white">{role}</p>
        </div>

        <nav className="space-y-1 overflow-y-auto">
          {role === 'owner' && (
            <>
              {ownerPrimary.map((item) => (
                <NavigationLink key={item[0]} item={item} onNavigate={() => setOpen(false)} />
              ))}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((value) => !value)}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm transition ${
                    advancedActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3"><Settings size={18} />Advanced</span>
                  <ChevronDown size={16} className={`transition-transform ${advancedOpen || advancedActive ? 'rotate-180' : ''}`} />
                </button>
                {(advancedOpen || advancedActive) && (
                  <div className="mt-1 space-y-1 border-l border-white/10 pl-3">
                    {ownerAdvanced.map((item) => (
                      <NavigationLink key={item[0]} item={item} onNavigate={() => setOpen(false)} />
                    ))}
                  </div>
                )}
              </div>
              <NavigationLink item={['Company Email', '/settings/email', Mail]} onNavigate={() => setOpen(false)} />
            </>
          )}

          {role === 'buyer' && buyerNav.map((item) => (
            <NavigationLink key={item[0]} item={item} onNavigate={() => setOpen(false)} />
          ))}

          {role === 'employee' && employeeNav.map((item) => (
            <NavigationLink key={item[0]} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </nav>

        <button
          onClick={() => supabase.auth.signOut()}
          className="mb-3 mt-5 rounded-xl border border-white/10 px-4 py-2 text-left text-xs text-slate-400 hover:text-white"
        >
          Sign out
        </button>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-400">Daily mission</p>
          <p className="mt-1 text-sm font-medium">Find. Pitch. Follow up. Close.</p>
        </div>
      </aside>

      <main className="lg:pl-72">
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#f4f7fb]/90 px-5 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
          <span className="text-sm font-semibold">DMH Sales OS</span>
          <span className="text-xs font-semibold text-blue-600">{role}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
