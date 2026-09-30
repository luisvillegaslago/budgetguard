import { CRYPTO_SYNC_STATUS, type CryptoSyncStatus } from '@/constants/finance';

/**
 * Whether a sync job with this status has not ended: queued or running. Every
 * other status is final, and no transition leaves it (see
 * CryptoSyncJobsRepository), so the panel stops polling it and a round that
 * finds its job there knows the job is over.
 */
export function isActiveSyncStatus(status: CryptoSyncStatus): boolean {
  return status === CRYPTO_SYNC_STATUS.PENDING || status === CRYPTO_SYNC_STATUS.RUNNING;
}
