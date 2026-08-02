export type EmailProvider = 'google_workspace';

export type CompanyEmailConnection = {
  id: string;
  company_id: string;
  provider: EmailProvider;
  desired_email: string;
  mailbox_email: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  scopes: string[];
  access_token_expires_at: string | null;
  google_history_id: string | null;
  last_verified_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  connected_by: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};
