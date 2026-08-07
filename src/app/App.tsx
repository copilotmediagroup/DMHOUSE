import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import TransactionDesk from '../pages/TransactionDesk';
import Shell from './Shell';
import BuyerShell from './BuyerShell';
import { LockKeyhole, LogOut, ShieldAlert } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '../components/Primitives';
import { supabase } from '../lib/supabase';
import OwnerCommand from '../pages/OwnerCommand';
import PortfolioList from '../pages/owner/PortfolioList';
import CreatePortfolio from '../pages/owner/CreatePortfolio';
import PortfolioDetail from '../pages/owner/PortfolioDetail';
import EmployeeToday from '../pages/employee/EmployeeToday';
import EmployeePortfolio from '../pages/employee/EmployeePortfolio';
import ProspectMode from '../pages/employee/ProspectMode';
import CreateAgency from '../pages/employee/CreateAgency';
import FollowUps from '../pages/employee/FollowUps';
import OutreachWorkspace from '../pages/employee/OutreachWorkspace';
import OutreachCommand from '../pages/owner/OutreachCommand';
import EmailTemplates from '../pages/owner/EmailTemplates';
import AgencyDirectory from '../pages/AgencyDirectory';
import AgencyDetail from '../pages/AgencyDetail';
import Placeholder from '../pages/Placeholder';
import AuditPage from '../pages/AuditPage';
import DistributionCommand from '../pages/owner/DistributionCommand';
import NegotiationCommand from '../pages/owner/NegotiationCommand';
import SubmitOffer from '../pages/employee/SubmitOffer';
import ClosingCommand from '../pages/owner/ClosingCommand';
import PipelineBoard from '../pages/PipelineBoard';
import PipelineForecast from '../pages/owner/PipelineForecast';
import EmployeePerformance from '../pages/employee/EmployeePerformance';
import EmployeeManagement from '../pages/owner/EmployeeManagement';
import AssignmentCenter from '../pages/owner/AssignmentCenter';
import { usePortfolioStore } from '../store/PortfolioStore';
import ConversationCenter from '../pages/ConversationCenter';
import FollowUpIntelligence from '../pages/FollowUpIntelligence';
import DealCommand from '../pages/owner/DealCommand';
import PortfolioMatching from '../pages/owner/PortfolioMatching';
import PortfolioCampaigns from '../pages/owner/PortfolioCampaigns';
import CampaignAssignments from '../pages/employee/CampaignAssignments';
import ReplyCommandCenter from '../pages/ReplyCommandCenter';
import AsIsReviewCenter from '../pages/owner/AsIsReviewCenter';
import ApprovalCenter from '../pages/owner/ApprovalCenter';
import ApprovalRequests from '../pages/employee/ApprovalRequests';
import RevenueCommand from '../pages/owner/RevenueCommand';
import PerformanceCommand from '../pages/owner/PerformanceCommand';
import BuyerPortalCommand from '../pages/owner/BuyerPortalCommand';
import BuyerMarketplace from '../pages/buyer/BuyerMarketplace';
import BuyerWorkspace from '../pages/buyer/BuyerWorkspace';
import BuyerLibrary from '../pages/buyer/BuyerLibrary';
import BuyerDealRoom from '../pages/buyer/BuyerDealRoom';
import OwnerBuyerDealRoom from '../pages/owner/OwnerBuyerDealRoom';
import AgreementSandbox from '../pages/owner/AgreementSandbox';
import DocumentStudio from '../pages/employee/DocumentStudio';
import MaskedPortfolioPreview from '../pages/employee/MaskedPortfolioPreview';
import EmployeeClosings from '../pages/employee/EmployeeClosings';
import EmployeeEarnings from '../pages/employee/EmployeeEarnings';
import BuyerDocuments from '../pages/buyer/BuyerDocuments';
import TransactionAutomationCommand from '../pages/owner/TransactionAutomationCommand';
import TransactionAlerts from '../pages/TransactionAlerts';
import OpportunityWorkspace from '../pages/OpportunityWorkspace';
import DealRiskCommand from '../pages/owner/DealRiskCommand';
import DealExecutionCommand from '../pages/owner/DealExecutionCommand';
import DealRecoveryCommand from '../pages/owner/DealRecoveryCommand';
import CompanyEmailSettings from '../pages/owner/CompanyEmailSettings';
function LoadingWorkspace(){
  return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"/><p className="mt-4 text-sm font-medium">Securing your workspace…</p></div></div>;
}

function AccountInactive(){
  return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="max-w-md text-center"><LockKeyhole className="mx-auto text-blue-400" size={38}/><h1 className="mt-5 text-2xl font-semibold">Account inactive</h1><p className="mt-3 text-slate-400">The owner has paused this account. Contact Data Market House for access.</p></div></div>;
}

function AccessDenied({expected,actual}:{expected:'owner'|'employee'|'buyer';actual:string}){
  const navigate=useNavigate();
  async function changeAccount(){
    await supabase.auth.signOut();
    navigate(expected==='buyer'?'/buyer':'/',{replace:true});
  }
  return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-300"><ShieldAlert size={28}/></div><p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-red-300">Workspace isolated</p><h1 className="mt-2 text-3xl font-semibold">You do not have permission to open this workspace.</h1><p className="mt-4 leading-7 text-slate-300">This address is reserved for the <strong className="text-white">{expected}</strong> portal, but the current session belongs to a <strong className="text-white">{actual}</strong>. No {expected} data has been loaded.</p><div className="mt-7 flex flex-wrap gap-3"><PrimaryButton onClick={changeAccount}><LogOut className="mr-2" size={17}/>Sign in with a different account</PrimaryButton><SecondaryButton onClick={()=>navigate(actual==='buyer'?'/buyer':actual==='employee'?'/employee':'/',{replace:true})}>Return to my workspace</SecondaryButton></div></div></div>;
}

function namespace(pathname:string):'owner'|'employee'|'buyer'|null{
  if(pathname==='/owner'||pathname.startsWith('/owner/'))return 'owner';
  if(pathname==='/employee'||pathname.startsWith('/employee/'))return 'employee';
  if(pathname==='/buyer'||pathname.startsWith('/buyer/'))return 'buyer';
  return null;
}

function OwnerRoutes(){
  return <Routes><Route path="/" element={<OwnerCommand/>}/><Route path="/owner" element={<Navigate to="/" replace/>}/><Route path="/portfolios" element={<PortfolioList/>}/><Route path="/portfolios/new" element={<CreatePortfolio/>}/><Route path="/portfolios/:id" element={<PortfolioDetail/>}/><Route path="/pipeline" element={<PipelineBoard/>}/><Route path="/pipeline/:opportunityId" element={<OpportunityWorkspace/>}/><Route path="/forecast" element={<PipelineForecast/>}/><Route path="/agencies" element={<AgencyDirectory/>}/><Route path="/agencies/:id" element={<AgencyDetail/>}/><Route path="/outreach" element={<OutreachCommand/>}/><Route path="/conversations" element={<ConversationCenter/>}/><Route path="/follow-ups" element={<FollowUpIntelligence/>}/><Route path="/distributions" element={<DistributionCommand/>}/><Route path="/templates" element={<EmailTemplates/>}/><Route path="/audit" element={<AuditPage/>}/><Route path="/transactions" element={<TransactionDesk/>}/><Route path="/deals" element={<Navigate to="/transactions" replace/>}/><Route path="/matching" element={<PortfolioMatching/>}/><Route path="/campaigns" element={<PortfolioCampaigns/>}/><Route path="/replies" element={<ReplyCommandCenter/>}/><Route path="/as-is-review" element={<AsIsReviewCenter/>}/><Route path="/approvals" element={<ApprovalCenter/>}/><Route path="/revenue" element={<RevenueCommand/>}/><Route path="/negotiations" element={<Navigate to="/transactions" replace/>}/><Route path="/closings" element={<Navigate to="/transactions" replace/>}/><Route path="/employees" element={<EmployeeManagement/>}/><Route path="/assignments" element={<AssignmentCenter/>}/><Route path="/analytics" element={<PerformanceCommand/>}/><Route path="/buyers" element={<Navigate to="/transactions" replace/>}/><Route path="/buyers/portfolio/:id" element={<OwnerBuyerDealRoom/>}/><Route path="/developer/agreements" element={<AgreementSandbox/>}/><Route path="/automation" element={<TransactionAutomationCommand/>}/><Route path="/risk" element={<DealRiskCommand/>}/><Route path="/execution" element={<DealExecutionCommand/>}/><Route path="/recovery" element={<DealRecoveryCommand/>}/><Route path="/settings" element={<Navigate to="/settings/email" replace/>}/><Route path="/settings/email" element={<CompanyEmailSettings/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
}

function EmployeeRoutes(){
  return <Routes><Route path="/employee" element={<EmployeeToday/>}/><Route path="/employee/transactions" element={<TransactionDesk/>}/><Route path="/employee/pipeline" element={<Navigate to="/employee/transactions" replace/>}/><Route path="/employee/pipeline/:opportunityId" element={<OpportunityWorkspace/>}/><Route path="/employee/portfolio" element={<EmployeePortfolio/>}/><Route path="/employee/portfolio/:portfolioId/preview" element={<MaskedPortfolioPreview/>}/><Route path="/employee/prospect" element={<ProspectMode/>}/><Route path="/employee/agencies/new" element={<CreateAgency/>}/><Route path="/employee/outreach" element={<OutreachWorkspace/>}/><Route path="/employee/campaigns" element={<CampaignAssignments/>}/><Route path="/employee/replies" element={<ReplyCommandCenter/>}/><Route path="/employee/approvals" element={<ApprovalRequests/>}/><Route path="/employee/conversations" element={<ConversationCenter/>}/><Route path="/employee/follow-up-intelligence" element={<FollowUpIntelligence/>}/><Route path="/employee/distribute" element={<Navigate to="/employee/documents" replace/>}/><Route path="/employee/distributions" element={<Navigate to="/employee/documents" replace/>}/><Route path="/employee/offers/new" element={<Navigate to="/employee/transactions" replace/>}/><Route path="/employee/documents" element={<DocumentStudio/>}/><Route path="/employee/closings" element={<Navigate to="/employee/transactions" replace/>}/><Route path="/employee/earnings" element={<EmployeeEarnings/>}/><Route path="/employee/alerts" element={<TransactionAlerts/>}/><Route path="/employee/agencies" element={<AgencyDirectory/>}/><Route path="/employee/agencies/:id" element={<AgencyDetail/>}/><Route path="/employee/follow-ups" element={<FollowUps/>}/><Route path="/employee/performance" element={<EmployeePerformance/>}/><Route path="*" element={<Navigate to="/employee" replace/>}/></Routes>;
}

function BuyerRoutes(){
  return <Routes><Route path="/buyer" element={<BuyerWorkspace/>}/><Route path="/buyer/marketplace" element={<BuyerMarketplace/>}/><Route path="/buyer/library" element={<BuyerLibrary/>}/><Route path="/buyer/portfolio/:id" element={<BuyerDealRoom/>}/><Route path="/buyer/portfolio/:id/documents" element={<BuyerDocuments/>}/><Route path="/buyer/alerts" element={<TransactionAlerts/>}/><Route path="*" element={<Navigate to="/buyer" replace/>}/></Routes>;
}

export default function App(){
  const {profile,loading}=usePortfolioStore();
  const location=useLocation();
  if(loading)return <LoadingWorkspace/>;
  if(!profile)return <LoadingWorkspace/>;
  if(!profile.is_active)return <AccountInactive/>;

  const role=profile.role;
  const requested=namespace(location.pathname);
  if(requested&&requested!==role)return <AccessDenied expected={requested} actual={role}/>;

  if(role==='buyer')return <BuyerShell><BuyerRoutes/></BuyerShell>;
  if(role==='employee')return <Shell><EmployeeRoutes/></Shell>;
  return <Shell><OwnerRoutes/></Shell>;
}
