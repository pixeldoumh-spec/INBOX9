import { useQuery } from '@tanstack/react-query';
import { getServices } from '../../api/services';

export function AppsPage() {
  const query = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  });

  if (query.isPending) return <main><h1>Apps</h1><p>Loading catalog…</p></main>;
  if (query.isError) return <main><h1>Apps</h1><p role="alert">Could not load the service catalog.</p></main>;

  return (
    <main>
      <h1>Apps</h1>
      <p>{query.data.services.length} services available.</p>
      <p>The visual app launcher will be implemented in Phase 2.</p>
    </main>
  );
}
