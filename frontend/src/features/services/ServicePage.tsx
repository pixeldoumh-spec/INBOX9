import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getServices } from '../../api/services';

export function ServicePage() {
  const { serviceId } = useParams();
  const services = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  });

  if (services.isPending) return <section className="feature-page"><p>Loading…</p></section>;
  if (services.isError) return <section className="feature-page"><p role="alert">Could not load this service.</p></section>;

  const service = services.data?.services.find((item) => item.id === serviceId);

  if (!service) {
    return (
      <section className="feature-page">
        <Link className="text-link" to="/apps">← Back to Apps</Link>
        <h1>Service not found</h1>
        <p>This service is not in the active catalog.</p>
      </section>
    );
  }

  return (
    <section className="feature-page">
      <Link className="text-link" to="/apps">← Back to Apps</Link>
      <div className="service-detail-card">
        <div className="service-icon service-icon-fallback service-detail-icon">
          {service.name.trim().split(/\\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}
        </div>
        <h1>{service.name}</h1>
        <p className="feature-muted">{service.category} · {service.country}</p>
        <div className="detail-row"><span>Price</span><strong>₹{(service.pricePaise / 100).toFixed(2)}</strong></div>
        <div className="detail-row"><span>Availability</span><strong>{service.purchasable ? 'Available' : 'Currently unavailable'}</strong></div>
        <p className="feature-note">The purchase and live OTP flow is the next implementation phase.</p>
      </div>
    </section>
  );
}
