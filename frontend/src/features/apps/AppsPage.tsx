import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getServices } from '../../api/services';
import type { Service } from '../../api/types';

function initials(name: string) {
  const words = name.trim().split(/\\s+/).filter(Boolean);
  if (!words.length) return '•';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function ServiceIcon({ service }: { service: Service }) {
  const [failed, setFailed] = useState(false);
  const src = `/service-icons/${service.id}.png`;

  if (failed) {
    return <span className="service-icon service-icon-fallback" aria-hidden="true">{initials(service.name)}</span>;
  }

  return (
    <span className="service-icon">
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}

export function AppsPage() {
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const services = useMemo(() => {
    const list = query.data?.services ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((service) => `${service.name} ${service.category}`.toLowerCase().includes(term));
  }, [query.data?.services, search]);

  if (query.isPending) {
    return <section className="launcher-page launcher-state"><div className="loading-pulse" /><p>Loading services…</p></section>;
  }

  if (query.isError) {
    return (
      <section className="launcher-page launcher-state">
        <div className="state-icon">!</div>
        <h1>Apps unavailable</h1>
        <p>We couldn't load the service catalog.</p>
        <button type="button" className="primary-button" onClick={() => query.refetch()}>Try again</button>
      </section>
    );
  }

  return (
    <section className="launcher-page">
      <div className="search-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search services…"
          aria-label="Search services"
          autoComplete="off"
          enterKeyHint="search"
        />
        {search ? <button type="button" className="clear-search" onClick={() => setSearch('')} aria-label="Clear search">×</button> : null}
      </div>

      <div className="catalog-meta" aria-live="polite">
        {search ? `${services.length} of ${query.data.services.length} services` : `${query.data.services.length} services`}
      </div>

      <div className="service-grid" aria-label="Services">
        {services.map((service) => (
          <Link
            key={service.id}
            to={`/apps/service/${encodeURIComponent(service.id)}`}
            className={`service-tile ${service.purchasable ? '' : 'service-tile-unavailable'}`}
            aria-label={service.purchasable ? `Open ${service.name}` : `${service.name}, currently unavailable`}
          >
            <ServiceIcon service={service} />
            <span className="service-name">{service.name}</span>
            {!service.purchasable ? <span className="service-status">Unavailable</span> : null}
          </Link>
        ))}
      </div>

      {services.length === 0 ? (
        <div className="empty-state">
          <div className="state-icon">⌕</div>
          <h2>No matching services</h2>
          <p>Try a different search.</p>
        </div>
      ) : null}
    </section>
  );
}
