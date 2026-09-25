import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getActivations } from '../../api/activations';

export function ActivePage() {
  const query = useQuery({
    queryKey: ['activations'],
    queryFn: getActivations,
  });

  if (query.isPending) return <main><h1>Active</h1><p>Loading activations…</p></main>;
  if (query.isError) return <main><h1>Active</h1><p role="alert">Could not load activations.</p></main>;

  return (
    <main>
      <h1>Active</h1>
      <p>{query.data.activations.length} activation(s).</p>
      <ul>
        {query.data.activations.map((activation) => (
          <li key={activation.id}>
            <Link to={'/active/' + activation.id}>
              {activation.service || activation.serviceId} — {activation.status}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
