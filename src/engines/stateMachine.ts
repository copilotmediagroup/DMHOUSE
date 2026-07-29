import type { PortfolioStatus, OfferStatus } from '../types/domain';
const portfolioTransitions:Record<PortfolioStatus,PortfolioStatus[]>={
 draft:['ready','archived'],ready:['active','archived'],active:['negotiating','reserved','archived'],negotiating:['active','reserved','archived'],reserved:['payment_pending','active'],payment_pending:['sold','active'],sold:['archived'],archived:[]
};
const offerTransitions:Record<OfferStatus,OfferStatus[]>={
 submitted:['owner_countered','accepted','rejected','expired'],owner_countered:['buyer_countered','accepted','rejected','expired'],buyer_countered:['owner_countered','accepted','rejected','expired'],accepted:['reserved'],rejected:[],expired:[],reserved:['closed','expired'],closed:[]
};
export const canTransitionPortfolio=(from:PortfolioStatus,to:PortfolioStatus)=>portfolioTransitions[from].includes(to);
export const canTransitionOffer=(from:OfferStatus,to:OfferStatus)=>offerTransitions[from].includes(to);
