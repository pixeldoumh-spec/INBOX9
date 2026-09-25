import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getServices } from '../../api/services';

export function ServicePage() {
  const { serviceId } = useParams();
  const services = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  });

  if (services.isPending) return <main><h1>Service</h1><p>Loading…</p></main>;

  const service = services.data?.services.find((item) => item.id === serviceId);
  if (!service) {
    return (
      <main>
        <h1>Service not found</h1>
        <Link to="/apps">Back to Apps</Link>
      </main>
    );
  }

  return (
    <main>
      <Link to="/apps">Back to Apps</Link>
      <h1>{service.name}</h1>
      <p>{service.category}</p>
      <p>{service.country} · {service.currency}</p>
      <p>Price: ₹{(service.pricePaise / 100).toFixed(2)}</p>
    </main>
  );
}
