export type UserRole = 'owner' | 'employee' | 'buyer';
export type PortfolioStatus = 'draft' | 'ready' | 'active' | 'negotiating' | 'reserved' | 'payment_pending' | 'sold' | 'archived';
export type OfferStatus = 'submitted' | 'owner_countered' | 'buyer_countered' | 'accepted' | 'rejected' | 'expired' | 'reserved' | 'closed';

export interface Metric {
  label: string;
  value: string | number;
  hint?: string;
}

export interface Decision {
  id: string;
  type: 'counter' | 'reservation' | 'closing' | 'follow_up';
  title: string;
  subtitle: string;
  amount?: number;
  urgency: 'normal' | 'high';
}

export interface Portfolio {
  id: string;
  name: string;
  originalCreditor: string;
  category: string;
  accountCount: number;
  faceValue: number;
  askingPrice: number;
  privateMinimum: number;
  acquisitionCost: number;
  employeeCommissionType: 'percentage' | 'flat';
  employeeCommissionValue: number;
  employeeCommissionVisible: boolean;
  description: string;
  sellingPoints: string[];
  status: PortfolioStatus;
  /** Legacy compatibility alias. New code must use maskedFile. */
  file?: PortfolioFile;
  maskedFile?: PortfolioFile;
  unmaskedFile?: PortfolioFile;
  createdAt: string;
  activatedAt?: string;
}

export interface PortfolioFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  dataUrl?: string;
  storagePath?: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  detail: string;
  occurredAt: string;
}
