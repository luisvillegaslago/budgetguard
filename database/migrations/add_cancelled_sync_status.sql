UPDATE "CryptoSyncJobs" SET "Status" = 'cancelled', "FinishedAt" = NOW(),
                            "ErrorCode" = 'cancelled', "ErrorMessage" = 'Stale from dev restart'
WHERE "JobID" = 5 AND "Status" = 'running';