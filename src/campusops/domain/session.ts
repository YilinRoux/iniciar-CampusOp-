export type CampusRole = 'reporter' | 'technician' | 'coordinator';
export interface LoginSession {
  actorId: string;
  role: CampusRole;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface RenewedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface SessionTransport {
  login(actorId: string): Promise<LoginSession>;
  refresh(refreshToken: string): Promise<RenewedSession>;
}
export interface ActiveSession extends LoginSession {
  generation: number;
  expiresAt: number;
}
