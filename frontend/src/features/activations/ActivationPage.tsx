import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getActivation } from '../../api/activations';

export function ActivationPage() {
  const { activationId } = useParams();
  const query = useQuery({
    queryKey: ['activation', activationId],
    queryFn: () => getActivation(activationId!),
    enabled: Boolean(activationId),
    refetchInterval: 2_000,
  });

  if (query.isPending) return <main><h1>Activation</h1><p>Loading…</p></main>;
  if (query.isError) return <main><h1>Activation</h1><p role="alert">Could not load this activation.</p></main>;

  const activation = query.data;

  return (
    <main>
      <Link to="/active">Back to Active</Link>
      <h1>{activation.service || activation.serviceId}</h1>
      <p>Status: {activation.status}</p>
      <p>Number: {activation.number || 'Pending'}</p>
      <p>OTP: {activation.otp || 'Waiting'}</p>
    </main>
  );
}
