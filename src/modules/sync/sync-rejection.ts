// Motivo por el que una operación offline no se pudo aplicar. No es un error
// HTTP: el endpoint responde 200 con el rechazo para que el cliente distinga
// "el servidor dijo que no" (requiere intervención) de "no llegó" (reintentar).
export type SyncRejectionCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'TENANT_MISMATCH'
  | 'TOO_OLD'
  | 'MEMBER_NOT_FOUND'
  | 'NO_ACTIVE_MEMBERSHIP'
  | 'CAPACITY_FULL'
  | 'DUPLICATE_MEMBER';

export class SyncRejection extends Error {
  constructor(
    public readonly code: SyncRejectionCode,
    message: string,
    // 'conflict': los datos chocan con otros que ya existen en el servidor.
    public readonly kind: 'rejected' | 'conflict' = 'rejected',
  ) {
    super(message);
    this.name = 'SyncRejection';
  }
}
