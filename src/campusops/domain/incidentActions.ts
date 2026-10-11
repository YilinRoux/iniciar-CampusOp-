export type SessionIncidentAction = 'start' | 'resolve' | 'close' | 'reopen';
export interface IncidentActions {
  perform(id: string, action: SessionIncidentAction, diagnosis?: string): Promise<string>;
}
