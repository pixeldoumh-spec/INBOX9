import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminProviders,
  getProviderQualification,
  getAdminServices,
  updateAdminService,
  type AdminService,
  type AdminServiceRoute,
  type AdminProvider,
  type AdminProviderHealth,
} from '../../api/admin';

type DraftRoute = Pick<AdminServiceRoute, 'providerId' | 'priority' | 'active'>;

function money(paise: number) {
  return '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function healthFor(provider: AdminProvider, health: AdminProviderHealth[]) {
  return health.find((item) => item.id === provider.id);
}

export function AdminServicesPage() {
  const client = useQueryClient();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [availability, setAvailability] = useState<'high' | 'medium' | 'low'>('high');
  const [active, setActive] = useState(true);
  const [routes, setRoutes] = useState<DraftRoute[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(input.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [input]);

  const services = useQuery({
    queryKey: ['admin-services', q, status, offset],
    queryFn: () => getAdminServices({ q, status, limit: 40, offset }),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnReconnect: true,
  });

  const providers = useQuery({
    queryKey: ['admin-providers'],
    queryFn: getAdminProviders,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnReconnect: true,
  });

  const qualification = useQuery({
    queryKey: ['admin-provider-qualification'],
    queryFn: getProviderQualification,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnReconnect: true,
  });

  const selected = Array.isArray(services.data?.services)
    ? services.data.services.find((service) => service.id === selectedId) ?? null
    : null;

  useEffect(() => {
    if (!services.data?.services.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !services.data.services.some((service) => service.id === selectedId)) {
      setSelectedId(services.data.services[0].id);
    }
  }, [services.data?.services, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setPrice((selected.pricePaise / 100).toFixed(2));
    setStock(String(selected.stock));
    setAvailability(selected.availability);
    setActive(selected.active);
    setRoutes(
      selected.routes.map((route) => ({
        providerId: route.providerId,
        priority: route.priority,
        active: route.active,
      })),
    );
    setSaveError(null);
    setSaveMessage(null);
  }, [selectedId]); // selection changes define the editable record

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a service first');
      const numericPrice = Number(price);
      const numericStock = Number(stock);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) throw new Error('Enter a valid price');
      if (!Number.isInteger(numericStock) || numericStock < 0) throw new Error('Stock must be a whole number');
      const activeRoutes = routes.filter((route) => route.active);
      if (active && !activeRoutes.length) {
        throw new Error('An active service needs at least one active provider route');
      }
      return updateAdminService(selected.id, {
        pricePaise: Math.round(numericPrice * 100),
        stock: numericStock,
        availability,
        active,
        routes,
      });
    },
    onSuccess: async () => {
      setSaveError(null);
      setSaveMessage('Service and routing saved.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-services'] }),
        client.invalidateQueries({ queryKey: ['admin-overview'] }),
        client.invalidateQueries({ queryKey: ['admin-providers'] }),
      ]);
    },
    onError: (error) => {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : 'Could not save service');
    },
  });

  const providerHealth = providers.data?.health ?? [];
  const installed = useMemo(() => new Set(providers.data?.installedAdapters ?? []), [providers.data?.installedAdapters]);
  const availableProviders = providers.data?.providers ?? [];
  const qualificationByProvider = qualification.data?.providers ?? [];
  const selectedQualification = qualification.data?.services.find((service) => service.id === selectedId) ?? null;

  function addRoute() {
    const candidate = availableProviders.find(
      (provider) => !routes.some((route) => route.providerId === provider.id),
    );
    if (!candidate) return;
    setRoutes((previous) => [
      ...previous,
      { providerId: candidate.id, priority: previous.length ? Math.max(...previous.map((r) => r.priority)) + 10 : 10, active: candidate.active },
    ]);
  }

  const summary = services.data?.summary;
  const hasMore = services.data?.pagination.hasMore ?? false;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + (services.data?.services.length ?? 0), summary?.total ?? 0);

  return (
    <section className="admin-page admin-services-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">CATALOG & ROUTING</span>
          <h1>Services</h1>
          <p>Control customer-visible catalog state and provider routing without mounting the Buy interface.</p>
        </div>
        <button className="outline-button" type="button" onClick={() => void Promise.all([services.refetch(), providers.refetch()])} disabled={services.isFetching || providers.isFetching}>
          {services.isFetching || providers.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="admin-overview-grid admin-service-summary-grid">
        <div className="admin-metric"><span>Matching services</span><strong>{(summary?.total ?? 0).toLocaleString('en-IN')}</strong><small>Current filter</small></div>
        <div className="admin-metric"><span>Active</span><strong>{(summary?.active ?? 0).toLocaleString('en-IN')}</strong><small>Customer-visible</small></div>
        <div className="admin-metric"><span>Inactive</span><strong>{(summary?.inactive ?? 0).toLocaleString('en-IN')}</strong><small>Hidden from customers</small></div>
      </div>

      <div className="admin-services-toolbar">
        <input className="admin-search-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search service name, ID or category" aria-label="Search services" />
        <select className="admin-filter-select" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setOffset(0); }} aria-label="Filter service status">
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All services</option>
        </select>
      </div>

      <div className="admin-provider-strip">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">PROVIDER REGISTRY</span>
            <h2>Providers</h2>
          </div>
          <span className="admin-status-badge">{availableProviders.length}</span>
        </div>
        <div className="admin-routing-help">
          <strong>External routing:</strong> {providers.data?.gateway.externalRoutingEnabled ? 'Enabled' : 'Disabled'} · Safe reserve retries remain disabled on uncertain outcomes.
        </div>
        <div className="admin-provider-list">
          {availableProviders.map((provider) => {
            const health = healthFor(provider, providerHealth);
            const adapterInstalled = installed.has(provider.adapterKey);
            return (
              <div className="admin-provider-card" key={provider.id}>
                <div>
                  <strong>{provider.name}</strong>
                  <span>{provider.id} · {provider.adapterKey}</span>
                </div>
                <div className="admin-provider-state">
                  <span className={provider.active ? 'admin-provider-pill is-on' : 'admin-provider-pill'}>{provider.active ? 'Active' : 'Inactive'}</span>
                  <span className={health?.healthy ? 'admin-provider-health is-healthy' : 'admin-provider-health'}>{health ? (health.healthy ? 'Healthy' : 'Unhealthy') : 'No check'}</span>
                  <small>Priority {provider.priority} · {provider.routedServices} routes · {adapterInstalled ? 'adapter installed' : 'adapter missing'}</small>
                </div>
              </div>
            );
          })}
          {!availableProviders.length && !providers.isPending ? <div className="admin-muted-copy">No providers are registered.</div> : null}
        </div>
        {providers.data?.routeHealth?.length ? <div className="admin-routing-help" style={{ marginTop: 12 }}>
          {providers.data.routeHealth.filter((row) => row.openedUntil && row.openedUntil > Date.now()).length} route circuit{providers.data.routeHealth.filter((row) => row.openedUntil && row.openedUntil > Date.now()).length === 1 ? '' : 's'} currently open · {providers.data.routeAttempts.length} recent route attempt{providers.data.routeAttempts.length === 1 ? '' : 's'} recorded.
        </div> : null}
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">PHASE 4 QUALIFICATION</span>
            <h2>Provider qualification</h2>
          </div>
          <span className="admin-status-badge">{qualification.data?.activeServiceCount ?? 0} services</span>
        </div>
        {qualification.isError ? <div className="admin-alert" role="alert"><strong>Qualification unavailable.</strong><span>Provider catalog qualification could not be loaded.</span><button className="outline-button" type="button" onClick={() => void qualification.refetch()}>Retry</button></div> : null}
        <div className="admin-provider-list">
          {qualificationByProvider.map((provider) => (
            <div className="admin-provider-card" key={provider.id}>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.adapterKey} · {provider.catalogCount} catalog services</span>
              </div>
              <div className="admin-provider-state">
                <span className={provider.status === 'live_internal' ? 'admin-provider-pill is-on' : 'admin-provider-pill'}>{provider.status.replaceAll('_', ' ')}</span>
                <small>{provider.verifiedMappings} verified · {provider.candidateMappings} candidates · {provider.staleMappings} stale</small>
              </div>
            </div>
          ))}
        </div>
        {selected && selectedQualification ? <div className="admin-routing-help" style={{ marginTop: 12 }}>
          <strong>{selected.name}:</strong>{' '}
          {Object.entries(selectedQualification.providers).map(([adapter, state]) => adapter + ' → ' + state.status.replaceAll('_', ' ') + (state.mapping ? ' (' + state.mapping + ')' : state.candidate ? ' [candidate ' + state.candidate + ']' : '')).join(' · ')}
        </div> : null}
      </section>

      <div className="admin-services-layout">
        <section className="admin-panel admin-service-list-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">SERVICE DIRECTORY</span>
              <h2>Catalog</h2>
            </div>
            <span className="admin-status-badge">{pageEnd ? pageStart + '–' + pageEnd : '0'}</span>
          </div>
          {services.isError ? <div className="admin-alert" role="alert"><strong>Catalog unavailable.</strong><span>Could not load the admin service directory.</span><button className="outline-button" type="button" onClick={() => void services.refetch()}>Retry</button></div> : null}
          {services.isPending ? <div className="admin-service-list">{Array.from({ length: 8 }, (_, index) => <div className="admin-service-skeleton" key={index} />)}</div> : null}
          {services.data?.services.length ? (
            <div className="admin-service-list">
              {services.data.services.map((service) => (
                <button type="button" key={service.id} className={'admin-service-row' + (service.id === selectedId ? ' is-selected' : '')} onClick={() => setSelectedId(service.id)}>
                  <span className="admin-service-main">
                    <strong>{service.name}</strong>
                    <span>{service.category} · {service.id}</span>
                  </span>
                  <span className="admin-service-side">
                    <b className={service.active ? 'admin-provider-pill is-on' : 'admin-provider-pill'}>{service.active ? 'Visible' : 'Hidden'}</b>
                    <strong>{money(service.pricePaise)}</strong>
                    <small>{service.routes.filter((route) => route.active).length} active route{service.routes.filter((route) => route.active).length === 1 ? '' : 's'}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : !services.isPending ? <div className="empty-state compact-empty"><h3>No services found</h3><p>Adjust the search or status filter.</p></div> : null}
          <div className="admin-pagination">
            <button className="outline-button" type="button" disabled={offset === 0 || services.isFetching} onClick={() => setOffset((value) => Math.max(0, value - 40))}>Previous</button>
            <span>{pageEnd ? pageStart + '–' + pageEnd + ' of ' + summary?.total : 'No results'}</span>
            <button className="outline-button" type="button" disabled={!hasMore || services.isFetching} onClick={() => setOffset((value) => value + 40)}>Next</button>
          </div>
        </section>

        <section className="admin-panel admin-service-editor-panel">
          {!selected ? (
            <div className="admin-user-detail-empty"><div className="admin-detail-mark">S</div><h2>Select a service</h2><p>Choose a service to inspect catalog settings and provider routing.</p></div>
          ) : (
            <>
              <div className="admin-panel-heading">
                <div>
                  <span className="admin-eyebrow">SERVICE CONFIGURATION</span>
                  <h2>{selected.name}</h2>
                  <span className="admin-service-id">{selected.id}</span>
                </div>
                <span className={active ? 'admin-provider-pill is-on' : 'admin-provider-pill'}>{active ? 'Customer-visible' : 'Hidden'}</span>
              </div>

              <div className="admin-service-form-grid">
                <label className="field"><span>Price (INR)</span><input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" /></label>
                <label className="field"><span>Stock</span><input value={stock} onChange={(event) => setStock(event.target.value)} inputMode="numeric" /></label>
                <label className="field"><span>Availability</span><select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                <label className="admin-service-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Visible to customers</strong><small>Controls whether this service appears in the customer Apps launcher.</small></span></label>
              </div>

              <div className="admin-routing-section">
                <div className="admin-panel-heading">
                  <div>
                    <span className="admin-eyebrow">PROVIDER ROUTES</span>
                    <h3>Routing order</h3>
                  </div>
                  <button className="outline-button" type="button" onClick={addRoute} disabled={!availableProviders.some((provider) => !routes.some((route) => route.providerId === provider.id))}>Add route</button>
                </div>
                <p className="admin-routing-help">Lower priority numbers are tried first. A route is usable only when both the route and its provider are active.</p>
                <div className="admin-route-list">
                  {routes.length ? routes.map((route, index) => {
                    const provider = availableProviders.find((item) => item.id === route.providerId);
                    return (
                      <div className="admin-route-row" key={route.providerId + '-' + index}>
                        <select value={route.providerId} onChange={(event) => setRoutes((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, providerId: event.target.value } : item))} aria-label={'Provider route ' + (index + 1)}>
                          {availableProviders.map((item) => <option key={item.id} value={item.id} disabled={item.id !== route.providerId && routes.some((existing, existingIndex) => existingIndex !== index && existing.providerId === item.id)}>{item.name}</option>)}
                        </select>
                        <input type="number" min="1" max="10000" value={route.priority} onChange={(event) => setRoutes((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, priority: Number(event.target.value) } : item))} aria-label={'Route priority ' + (index + 1)} />
                        <label className="admin-route-switch"><input type="checkbox" checked={route.active} onChange={(event) => setRoutes((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item))} /><span>{route.active ? 'Active' : 'Off'}</span></label>
                        <button className="text-button compact-button" type="button" onClick={() => setRoutes((previous) => previous.filter((_item, itemIndex) => itemIndex !== index))}>Remove</button>
                        {provider && !provider.active ? <small className="admin-route-warning">Provider inactive</small> : null}
                      </div>
                    );
                  }) : <div className="admin-muted-copy">No routes configured. This service cannot be activated while visible.</div>}
                </div>
              </div>

              {saveError ? <div className="form-error" role="alert">{saveError}</div> : null}
              {saveMessage ? <div className="success-card" role="status">{saveMessage}</div> : null}
              <div className="admin-service-editor-actions">
                <span className="admin-muted-copy">{routes.filter((route) => route.active).length} active route{routes.filter((route) => route.active).length === 1 ? '' : 's'}</span>
                <button className="primary-button" type="button" onClick={() => void save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save service'}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
