import { useState, useEffect, useCallback } from 'react';
import { shoppingApi } from '../lib/shopping-api.js';
import type { MerchantStatus, AggregatedItemResult, ProductResult, ShoppingListResult, ShoppingLearning } from '../lib/shopping-api.js';

export default function ShoppingPage() {
  const [merchants, setMerchants] = useState<MerchantStatus[]>([]);
  const [listText, setListText] = useState('');
  const [results, setResults] = useState<ShoppingListResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [learnings, setLearnings] = useState<ShoppingLearning[]>([]);
  const [learningQuery, setLearningQuery] = useState('');

  const loadMerchants = useCallback(async () => {
    try {
      const data = await shoppingApi.merchants();
      setMerchants(data.merchants);
    } catch { /* ignore */ }
  }, []);

  const loadLearnings = useCallback(async (query?: string) => {
    try {
      const data = await shoppingApi.learnings(query || undefined);
      setLearnings(data.learnings);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadMerchants();
    loadLearnings();
  }, [loadMerchants, loadLearnings]);

  const handleSearch = async () => {
    const items = listText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (items.length === 0) return;

    setSearching(true);
    setError('');
    setResults(null);
    try {
      const data = await shoppingApi.searchList(items);
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleLearningSearch = () => {
    loadLearnings(learningQuery);
  };

  const loggedInCount = merchants.filter(m => m.loggedIn).length;

  return (
    <div className="page-container shopping-page">
      <h2>Shopping</h2>
      <p className="text-muted">Search products across merchants. Compare prices, brands, and quantities.</p>

      {/* Merchant Status Bar */}
      <MerchantStatusBar merchants={merchants} />

      {/* Shopping List Input */}
      <div className="shopping-input-section">
        <textarea
          className="shopping-list-input"
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          placeholder="Enter shopping list (one item per line)&#10;e.g.&#10;Organic Greek Yogurt&#10;Avocados&#10;Chicken breast"
          rows={5}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSearch();
          }}
        />
        <div className="shopping-input-actions">
          <button
            className="btn-primary"
            onClick={handleSearch}
            disabled={searching || listText.trim().length === 0 || loggedInCount === 0}
          >
            {searching ? 'Searching...' : `Search ${loggedInCount} Merchant${loggedInCount !== 1 ? 's' : ''}`}
          </button>
          {loggedInCount === 0 && (
            <span className="text-muted" style={{ fontSize: '12px' }}>Log in to merchants via the Merchants panel in the sidebar</span>
          )}
        </div>
      </div>

      {error && <div className="shopping-error">{error}</div>}

      {/* Results */}
      {results && (
        <div className="shopping-results">
          {results.items.map((item, i) => (
            <ShoppingItemCard key={i} item={item} />
          ))}
          <CartSummary results={results} />
        </div>
      )}

      {/* Learnings Section */}
      <LearningsSection
        learnings={learnings}
        query={learningQuery}
        onQueryChange={setLearningQuery}
        onSearch={handleLearningSearch}
      />
    </div>
  );
}

function MerchantStatusBar({ merchants }: { merchants: MerchantStatus[] }) {
  if (merchants.length === 0) return null;

  return (
    <div className="merchant-status-bar">
      {merchants.map(m => (
        <span key={m.id} className={`merchant-badge ${m.loggedIn ? 'logged-in' : 'logged-out'}`}>
          <span className={`status-dot ${m.loggedIn ? 'connected' : ''}`} />
          {m.name}
        </span>
      ))}
    </div>
  );
}

function ShoppingItemCard({ item }: { item: AggregatedItemResult }) {
  const [expanded, setExpanded] = useState(false);
  const [sortCol, setSortCol] = useState<'pricePerUnitCents' | 'priceCents' | 'merchant'>('pricePerUnitCents');
  const [sortAsc, setSortAsc] = useState(true);
  // Track dismissed rows by index — stores the reason string
  const [dismissed, setDismissed] = useState<Map<number, string>>(new Map());

  const handleSort = (col: typeof sortCol) => {
    if (col === sortCol) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const handleDismiss = (idx: number, reason: string) => {
    setDismissed(prev => new Map(prev).set(idx, reason));
  };

  const handleRestore = (idx: number) => {
    setDismissed(prev => { const m = new Map(prev); m.delete(idx); return m; });
  };

  const visibleResults = item.results.filter((_, i) => !dismissed.has(i));

  const sorted = [...visibleResults].sort((a, b) => {
    let cmp: number;
    if (sortCol === 'merchant') {
      cmp = a.merchant.localeCompare(b.merchant);
    } else {
      const aVal = a[sortCol] || Number.MAX_SAFE_INTEGER;
      const bVal = b[sortCol] || Number.MAX_SAFE_INTEGER;
      cmp = aVal - bVal;
    }
    return sortAsc ? cmp : -cmp;
  });

  const bestPriceLabel = item.bestPrice && !dismissed.has(item.results.indexOf(item.bestPrice))
    ? `$${(item.bestPrice.priceCents / 100).toFixed(2)} at ${cap(item.bestPrice.merchant)}`
    : '';
  const bestValueLabel = item.bestValue && item.bestValue.pricePerUnitCents > 0 && !dismissed.has(item.results.indexOf(item.bestValue))
    ? `$${(item.bestValue.pricePerUnitCents / 100).toFixed(2)}/${item.bestValue.unit} at ${cap(item.bestValue.merchant)}`
    : '';

  const dismissedCount = dismissed.size;

  return (
    <div className="shopping-item-card">
      <div className="shopping-item-header" onClick={() => setExpanded(!expanded)}>
        <svg className={`event-chevron ${expanded ? 'open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="shopping-item-query">{item.query}</span>
        <span className="shopping-item-count">{visibleResults.length} options{dismissedCount > 0 ? ` (${dismissedCount} hidden)` : ''}</span>
        {bestPriceLabel && <span className="shopping-badge best-price">{bestPriceLabel}</span>}
        {bestValueLabel && <span className="shopping-badge best-value">{bestValueLabel}</span>}
      </div>

      {expanded && (
        <div className="shopping-item-body">
          {visibleResults.length === 0 && dismissedCount === 0 ? (
            <p className="text-muted">No products found across merchants.</p>
          ) : visibleResults.length === 0 ? (
            <p className="text-muted">All results dismissed.</p>
          ) : (
            <table className="shopping-compare-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort('merchant')}>
                    Merchant {sortCol === 'merchant' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th>Brand</th>
                  <th className="sortable" onClick={() => handleSort('priceCents')}>
                    Price {sortCol === 'priceCents' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th>Qty</th>
                  <th className="sortable" onClick={() => handleSort('pricePerUnitCents')}>
                    $/Unit {sortCol === 'pricePerUnitCents' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th>Delivery</th>
                  <th>Stock</th>
                  <th className="dismiss-col"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const origIdx = item.results.indexOf(p);
                  return (
                    <ProductRow
                      key={origIdx}
                      product={p}
                      isBestPrice={p === item.bestPrice}
                      isBestValue={p === item.bestValue}
                      onDismiss={(reason) => handleDismiss(origIdx, reason)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
          {dismissedCount > 0 && (
            <DismissedSummary dismissed={dismissed} results={item.results} onRestore={handleRestore} />
          )}
          {item.failedMerchants.length > 0 && (
            <p className="text-muted" style={{ marginTop: 8, fontSize: '12px' }}>
              Could not search: {item.failedMerchants.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const DISMISS_REASONS = ['Not Organic', 'Not intended product type', 'Other'] as const;

function ProductRow({ product: p, isBestPrice, isBestValue, onDismiss }: {
  product: ProductResult; isBestPrice: boolean; isBestValue: boolean;
  onDismiss: (reason: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [customReason, setCustomReason] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const rowClass = [
    'shopping-product-row',
    isBestPrice ? 'best-price-row' : '',
    isBestValue ? 'best-value-row' : '',
  ].filter(Boolean).join(' ');

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the dismiss area
    if ((e.target as HTMLElement).closest('.dismiss-cell')) return;
    if (p.url) window.open(p.url, '_blank');
  };

  const handleReasonClick = (reason: string) => {
    if (reason === 'Other') {
      setShowCustom(true);
    } else {
      onDismiss(reason);
      setMenuOpen(false);
    }
  };

  const handleCustomSubmit = () => {
    if (customReason.trim()) {
      onDismiss(customReason.trim());
      setMenuOpen(false);
      setShowCustom(false);
      setCustomReason('');
    }
  };

  return (
    <tr className={rowClass} onClick={handleRowClick} style={p.url ? { cursor: 'pointer' } : undefined}>
      <td>{cap(p.merchant)}</td>
      <td>{p.brand || '-'}</td>
      <td>{p.priceCents ? `$${(p.priceCents / 100).toFixed(2)}` : 'N/A'}</td>
      <td>{p.quantity || '-'}</td>
      <td>{p.pricePerUnitCents ? `$${(p.pricePerUnitCents / 100).toFixed(2)}/${p.unit}` : 'N/A'}</td>
      <td>{p.deliveryEstimate || (p.deliveryAvailable ? 'Yes' : 'No')}</td>
      <td className={p.inStock ? '' : 'out-of-stock'}>{p.inStock ? 'In stock' : 'Out'}</td>
      <td className="dismiss-cell">
        <div className="dismiss-wrapper">
          <button
            className="btn-icon-xs dismiss-btn"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); setShowCustom(false); }}
            title="Dismiss result"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
          {menuOpen && (
            <div className="dismiss-menu" onClick={(e) => e.stopPropagation()}>
              {!showCustom ? (
                <>
                  <div className="dismiss-menu-label">Not a match?</div>
                  {DISMISS_REASONS.map(r => (
                    <button key={r} className="dismiss-menu-item" onClick={() => handleReasonClick(r)}>{r}</button>
                  ))}
                </>
              ) : (
                <div className="dismiss-custom">
                  <input
                    autoFocus
                    placeholder="Reason..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit(); if (e.key === 'Escape') { setShowCustom(false); setMenuOpen(false); } }}
                  />
                  <button className="btn-primary btn-xs" onClick={handleCustomSubmit}>OK</button>
                </div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function DismissedSummary({ dismissed, results, onRestore }: {
  dismissed: Map<number, string>; results: ProductResult[]; onRestore: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="dismissed-summary">
      <button className="btn-ghost btn-xs" onClick={() => setExpanded(!expanded)}>
        {dismissed.size} dismissed result{dismissed.size !== 1 ? 's' : ''} {expanded ? '(hide)' : '(show)'}
      </button>
      {expanded && (
        <div className="dismissed-list">
          {[...dismissed.entries()].map(([idx, reason]) => {
            const p = results[idx];
            if (!p) return null;
            return (
              <div key={idx} className="dismissed-item">
                <span className="dismissed-name">{p.name}</span>
                <span className="dismissed-reason">{reason}</span>
                <button className="btn-ghost btn-xs" onClick={() => onRestore(idx)}>Restore</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CartSummary({ results }: { results: ShoppingListResult }) {
  const itemCount = results.items.length;
  const total = results.totalEstimatedCents;

  return (
    <div className="shopping-cart-summary">
      <span className="cart-total">
        Estimated total: <strong>${(total / 100).toFixed(2)}</strong>
      </span>
      <span className="cart-count">{itemCount} item{itemCount !== 1 ? 's' : ''}, best price per item</span>
    </div>
  );
}

function LearningsSection({ learnings, query, onQueryChange, onSearch }: {
  learnings: ShoppingLearning[];
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="shopping-learnings-section">
      <div className="shopping-learnings-header" onClick={() => setExpanded(!expanded)}>
        <svg className={`event-chevron ${expanded ? 'open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span>Shopping Learnings</span>
        <span className="text-muted" style={{ fontSize: '12px', marginLeft: 8 }}>{learnings.length} entries</span>
      </div>

      {expanded && (
        <div className="shopping-learnings-body">
          <div className="shopping-learnings-search">
            <input
              type="text"
              placeholder="Search learnings..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
            />
            <button className="btn-ghost btn-xs" onClick={onSearch}>Search</button>
          </div>
          {learnings.length === 0 ? (
            <p className="text-muted">No learnings yet. They will appear as you use shopping tools.</p>
          ) : (
            <div className="shopping-learnings-list">
              {learnings.map(l => (
                <div key={l.id} className="shopping-learning-card">
                  <div className="learning-title">
                    {l.title}
                    {l.merchant && <span className="merchant-tag">{l.merchant}</span>}
                    {l.category && <span className="category-tag">{l.category}</span>}
                  </div>
                  <div className="learning-content">{l.content}</div>
                  <div className="learning-meta">
                    {l.tags.join(', ')} &middot; {new Date(l.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
