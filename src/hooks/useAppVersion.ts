import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, QUERY_KEY } from '@/constants/finance';

interface VersionInfo {
  version: string;
}

export function useAppVersion() {
  const { data } = useQuery<VersionInfo>({
    queryKey: [QUERY_KEY.VERSION],
    queryFn: async () => {
      const res = await fetch(API_ENDPOINT.VERSION);
      if (!res.ok) throw new Error('Failed to fetch version');
      return res.json();
    },
    staleTime: Infinity,
  });

  return data?.version ?? null;
}
