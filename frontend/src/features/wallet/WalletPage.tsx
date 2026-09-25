import { useQuery } from '@tanstack/react-query';
import { getWallet } from '../../api/wallet';

export function WalletPage() {
  const query = useQuery({
    queryKey: ['wallet'],
    queryFn: getWallet,
  });

  if (query.isPending) return <main><h1>Wallet</h1><p>Loading…</p></main>;
  if (query.isError) return <main><h1>Wallet</h1><p role="alert">Could not load wallet.</p></main>;

  return (
    <main>
      <h1>Wallet</h1>
      <p>Balance: ₹{(query.data.balancePaise / 100).toFixed(2)}</p>
    </main>
  );
}
