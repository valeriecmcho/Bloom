import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAdmin, AdminProduct } from '../../context/AdminContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'adjustment' | 'restock' | 'sale' | 'return';
  delta: number;          // positive = added, negative = removed
  reason: string;
  before: number;
  after: number;
  timestamp: string;      // ISO string
  shade?: string;
}

const STORAGE_KEY = 'bloom_stock_movements';

function loadMovements(): StockMovement[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveMovements(movements: StockMovement[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movements.slice(0, 500)));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStockStatus(stock: number) {
  if (stock > 50) return { label: 'In Stock',     color: 'bg-green-100 text-green-800',  dot: 'bg-green-500' };
  if (stock > 0)  return { label: 'Low Stock',    color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' };
  return               { label: 'Out of Stock', color: 'bg-red-100 text-red-800',     dot: 'bg-red-500' };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function exportCSV(products: AdminProduct[]) {
  const headers = ['Product', 'Brand', 'Category', 'Price', 'Stock', 'Status', 'Rating'];
  const rows = products.map(p => [
    `"${p.name}"`, `"${p.brand}"`, p.category,
    p.price, p.stock, getStockStatus(p.stock).label, p.rating,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bloom-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Restock / Adjust Modal ───────────────────────────────────────────────────

type ModalMode = 'restock' | 'adjust';

interface StockModalProps {
  product: AdminProduct;
  mode: ModalMode;
  onClose: () => void;
  onSave: (movement: Omit<StockMovement, 'id' | 'timestamp'>) => void;
}

function StockModal({ product, mode, onClose, onSave }: StockModalProps) {
  const hasShades = (product.shades ?? []).length > 0;

  const [globalQty, setGlobalQty]       = useState('');
  const [reason, setReason]             = useState('');
  const [adjType, setAdjType]           = useState<'add' | 'subtract'>('add');
  const [selectedShade, setSelectedShade] = useState<string>('');
  const [shadeQties, setShadeQties]     = useState<Record<string, string>>({});

  const totalShadeQty = Object.values(shadeQties).reduce(
    (s, v) => s + (parseInt(v) || 0), 0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const shadeId   = selectedShade || undefined;
    const shadeName = shadeId
      ? product.shades?.find(s => s.id === shadeId)?.name
      : undefined;

    let qty = hasShades && mode === 'restock'
      ? totalShadeQty
      : parseInt(globalQty) || 0;

    if (mode === 'adjust' && adjType === 'subtract') qty = -Math.abs(qty);

    const before = hasShades && shadeId
      ? (product.shades?.find(s => s.id === shadeId)?.stock ?? product.stock)
      : product.stock;

    onSave({
      productId:   product.id,
      productName: product.name,
      type:        mode === 'restock' ? 'restock' : 'adjustment',
      delta:       qty,
      reason:      reason || (mode === 'restock' ? 'Restock' : `Manual ${adjType}`),
      before,
      after:       Math.max(0, before + qty),
      shade:       shadeName,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-[16px]">
      <div className="bg-white rounded-[20px] w-full max-w-[480px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-[28px] py-[20px] flex items-center justify-between ${mode === 'restock' ? 'bg-blue-50' : 'bg-orange-50'}`}>
          <div>
            <h2 className="font-['Playfair_Display:Bold',sans-serif] font-bold text-[20px] text-[#2d2d2d]">
              {mode === 'restock' ? '📦 Restock Product' : '🔧 Adjust Stock'}
            </h2>
            <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#4a5565] mt-[2px]">
              {product.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#4a5565] hover:text-[#2d2d2d] text-[22px] leading-none transition-colors"
          >×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-[28px] space-y-[18px]">
          {/* Current stock display */}
          <div className="bg-gray-50 rounded-[12px] p-[14px] flex items-center gap-[16px]">
            <div className="size-[44px] bg-[#fffbf0] rounded-[8px] overflow-hidden flex-shrink-0">
              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#4a5565]">Current Stock</p>
              <p className={`font-['Plus_Jakarta_Sans:Bold',sans-serif] font-bold text-[22px] ${
                product.stock > 50 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'
              }`}>{product.stock} units</p>
            </div>
            {hasShades && (
              <div className="ml-auto text-right">
                <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[11px] text-[#4a5565]">{product.shades!.length} shades</p>
              </div>
            )}
          </div>

          {/* Adjust type selector */}
          {mode === 'adjust' && (
            <div className="flex gap-[8px]">
              {(['add', 'subtract'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAdjType(t)}
                  className={`flex-1 h-[40px] rounded-[10px] font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px] transition-colors ${
                    adjType === t
                      ? t === 'add' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      : 'bg-gray-100 text-[#4a5565] hover:bg-gray-200'
                  }`}
                >
                  {t === 'add' ? '+ Add Stock' : '− Remove Stock'}
                </button>
              ))}
            </div>
          )}

          {/* Shade breakdown (restock only) */}
          {hasShades && mode === 'restock' && (
            <div>
              <label className="font-['Plus_Jakarta_Sans:Medium',sans-serif] font-medium text-[13px] text-[#2d2d2d] block mb-[10px]">
                Quantity per Shade
              </label>
              <div className="space-y-[8px] max-h-[200px] overflow-y-auto pr-[4px]">
                {product.shades!.map(shade => (
                  <div key={shade.id} className="flex items-center gap-[10px]">
                    <span
                      className="size-[20px] rounded-full border border-gray-200 flex-shrink-0"
                      style={{ background: shade.color }}
                    />
                    <span className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#2d2d2d] flex-1 truncate">
                      {shade.name}
                    </span>
                    <span className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[11px] text-[#4a5565] w-[36px] text-right">
                      {shade.stock}
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={shadeQties[shade.id] ?? ''}
                      onChange={e => setShadeQties(prev => ({ ...prev, [shade.id]: e.target.value }))}
                      className="w-[64px] h-[32px] rounded-[8px] border-[1px] border-[rgba(0,0,0,0.12)] px-[8px] text-center font-['Plus_Jakarta_Sans:SemiBold',sans-serif] text-[13px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
                    />
                  </div>
                ))}
              </div>
              {totalShadeQty > 0 && (
                <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-blue-600 mt-[8px]">
                  Total to add: <strong>{totalShadeQty}</strong> units
                </p>
              )}
            </div>
          )}

          {/* Global quantity (non-shade restock or adjust) */}
          {(!hasShades || mode === 'adjust') && (
            <div>
              <label className="font-['Plus_Jakarta_Sans:Medium',sans-serif] font-medium text-[13px] text-[#2d2d2d] block mb-[8px]">
                {mode === 'restock' ? 'Quantity to Add' : 'Quantity'}
              </label>
              {hasShades && mode === 'adjust' && (
                <div className="mb-[8px]">
                  <select
                    value={selectedShade}
                    onChange={e => setSelectedShade(e.target.value)}
                    className="w-full h-[40px] rounded-[10px] border-[1px] border-[rgba(0,0,0,0.12)] px-[12px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors mb-[8px]"
                  >
                    <option value="">All shades (total stock)</option>
                    {product.shades!.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (stock: {s.stock})</option>
                    ))}
                  </select>
                </div>
              )}
              <input
                type="number"
                min="1"
                required
                value={globalQty}
                onChange={e => setGlobalQty(e.target.value)}
                placeholder="Enter quantity"
                className="w-full h-[44px] rounded-[12px] border-[1px] border-[rgba(0,0,0,0.12)] px-[16px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[14px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
              />
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="font-['Plus_Jakarta_Sans:Medium',sans-serif] font-medium text-[13px] text-[#2d2d2d] block mb-[8px]">
              Reason <span className="text-[#4a5565] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={mode === 'restock' ? 'e.g. New shipment from supplier' : 'e.g. Damaged goods, correction'}
              className="w-full h-[44px] rounded-[12px] border-[1px] border-[rgba(0,0,0,0.12)] px-[16px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[14px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-[12px] pt-[4px]">
            <button
              type="submit"
              className={`flex-1 h-[46px] rounded-[26843500px] font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[15px] text-white transition-colors ${
                mode === 'restock' ? 'bg-blue-600 hover:bg-blue-700' : adjType === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {mode === 'restock' ? 'Confirm Restock' : adjType === 'add' ? 'Add Stock' : 'Remove Stock'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-[46px] rounded-[26843500px] border-[1px] border-[rgba(0,0,0,0.12)] text-[#2d2d2d] hover:bg-gray-50 transition-colors font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[15px]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: number; sub?: string; accent: string;
}) {
  return (
    <div className={`bg-white rounded-[16px] p-[24px] border-[1px] border-[rgba(0,0,0,0.05)] shadow-sm`}>
      <div className={`${accent} rounded-[12px] size-[48px] flex items-center justify-center mb-[16px] text-[24px]`}>
        {icon}
      </div>
      <p className="font-['Plus_Jakarta_Sans:Medium',sans-serif] font-medium text-[14px] text-[#4a5565] mb-[4px]">{label}</p>
      <p className="font-['Playfair_Display:Bold',sans-serif] font-bold text-[28px] text-[#2d2d2d] leading-none">{value}</p>
      {sub && <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#4a5565] mt-[6px]">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const { adminProducts, updateProduct, deleteProduct } = useAdmin();

  // ── UI state ──
  const [searchQuery, setSearchQuery]             = useState('');
  const [selectedCategory, setSelectedCategory]   = useState('All');
  const [statusFilter, setStatusFilter]           = useState<'All' | 'In Stock' | 'Low Stock' | 'Out of Stock'>('All');
  const [sortBy, setSortBy]                       = useState<'name' | 'stock-asc' | 'stock-desc' | 'price'>('name');
  const [activeTab, setActiveTab]                 = useState<'inventory' | 'history' | 'alerts'>('inventory');
  const [modalTarget, setModalTarget]             = useState<{ product: AdminProduct; mode: ModalMode } | null>(null);
  const [historyFilter, setHistoryFilter]         = useState('');

  // ── Inline stock editing ──
  const [editingStockId, setEditingStockId]       = useState<string | null>(null);
  const [editStockValue, setEditStockValue]       = useState('');

  // ── Stock movements ──
  const [movements, setMovements] = useState<StockMovement[]>(loadMovements);

  const addMovement = useCallback((mov: Omit<StockMovement, 'id' | 'timestamp'>) => {
    const full: StockMovement = {
      ...mov,
      id:        Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    setMovements(prev => {
      const updated = [full, ...prev];
      saveMovements(updated);
      return updated;
    });

    // Compute new stock and apply
    if (mov.type === 'restock') {
      const product = adminProducts.find(p => p.id === mov.productId);
      if (product) {
        updateProduct(product.id, { stock: Math.max(0, product.stock + mov.delta) });
      }
    } else if (mov.type === 'adjustment') {
      const product = adminProducts.find(p => p.id === mov.productId);
      if (product) {
        updateProduct(product.id, { stock: Math.max(0, product.stock + mov.delta) });
      }
    }
  }, [adminProducts, updateProduct]);

  // Persist movements when they change (already saved inside addMovement)
  useEffect(() => {
    saveMovements(movements);
  }, [movements]);

  // ── Derived stats ──
  const totalProducts = adminProducts.length;
  const lowStock      = adminProducts.filter(p => p.stock > 0  && p.stock <= 50).length;
  const outOfStock    = adminProducts.filter(p => p.stock === 0).length;
  const totalUnits    = adminProducts.reduce((s, p) => s + p.stock, 0);

  // ── Filtering & sorting ──
  const categories = ['All', ...Array.from(new Set(adminProducts.map(p => p.category)))].filter(Boolean);

  const filteredProducts = adminProducts
    .filter(p => {
      const matchSearch   = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.brand.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat      = selectedCategory === 'All' || p.category === selectedCategory;
      const matchStatus   = statusFilter === 'All' || getStockStatus(p.stock).label === statusFilter;
      return matchSearch && matchCat && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'stock-asc')  return a.stock - b.stock;
      if (sortBy === 'stock-desc') return b.stock - a.stock;
      if (sortBy === 'price')      return a.price - b.price;
      return a.name.localeCompare(b.name);
    });

  // ── Inline stock edit ──
  const handleEditStock = (id: string, current: number) => {
    setEditingStockId(id);
    setEditStockValue(current.toString());
  };

  const handleSaveStock = (product: AdminProduct) => {
    const newStock = parseInt(editStockValue);
    if (!isNaN(newStock) && newStock >= 0) {
      const delta = newStock - product.stock;
      addMovement({
        productId:   product.id,
        productName: product.name,
        type:        'adjustment',
        delta,
        reason:      'Direct stock edit',
        before:      product.stock,
        after:       newStock,
      });
      // updateProduct already called inside addMovement via adjustment path
      // but we set it directly here too for the inline path
      updateProduct(product.id, { stock: newStock });
    }
    setEditingStockId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}" from inventory?`)) {
      deleteProduct(id);
    }
  };

  // ── Alert products ──
  const alertProducts = adminProducts
    .filter(p => p.stock <= 50)
    .sort((a, b) => a.stock - b.stock);

  // ── Filtered movements ──
  const filteredMovements = movements.filter(m =>
    !historyFilter ||
    m.productName.toLowerCase().includes(historyFilter.toLowerCase()) ||
    m.reason.toLowerCase().includes(historyFilter.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-[32px]">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between mb-[28px]">
          <div>
            <h1 className="font-['Playfair_Display:Bold',sans-serif] font-bold text-[32px] text-[#2d2d2d] mb-[4px]">
              Inventory
            </h1>
            <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[16px] text-[#4a5565]">
              Monitor and manage your stock levels in real-time
            </p>
          </div>
          <div className="flex gap-[12px]">
            <button
              onClick={() => exportCSV(adminProducts)}
              className="flex items-center gap-[8px] h-[42px] px-[18px] rounded-[26843500px] border-[1px] border-[rgba(0,0,0,0.12)] text-[#2d2d2d] hover:bg-gray-50 transition-colors font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px]"
            >
              <svg className="size-[16px]" fill="none" viewBox="0 0 20 20">
                <path d="M3.333 14.167v1.666A1.667 1.667 0 005 17.5h10a1.667 1.667 0 001.667-1.667v-1.666M10 12.5V2.5M6.667 9.167L10 12.5l3.333-3.333"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-4 gap-[20px] mb-[28px]">
          <StatCard icon="📦" label="Total Products" value={totalProducts} accent="bg-blue-100" />
          <StatCard icon="🔢" label="Total Units"    value={totalUnits}    accent="bg-purple-100" sub="across all products" />
          <StatCard icon="⚠️" label="Low Stock"      value={lowStock}      accent="bg-yellow-100" sub="≤ 50 units remaining" />
          <StatCard icon="🚨" label="Out of Stock"   value={outOfStock}    accent="bg-red-100"    sub="Need immediate restock" />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-[0px] mb-[24px] border-b border-gray-200">
          {([
            { key: 'inventory', label: '📋 Inventory Table' },
            { key: 'alerts',    label: `🔔 Alerts${alertProducts.length ? ` (${alertProducts.length})` : ''}` },
            { key: 'history',   label: `🕐 Movement History${movements.length ? ` (${movements.length})` : ''}` },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-[20px] py-[12px] font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[14px] border-b-[2px] transition-colors ${
                activeTab === tab.key
                  ? 'border-[#ff1a75] text-[#ff1a75]'
                  : 'border-transparent text-[#4a5565] hover:text-[#2d2d2d]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════ INVENTORY TABLE TAB ════════════ */}
        {activeTab === 'inventory' && (
          <div className="bg-white rounded-[16px] border-[1px] border-[rgba(0,0,0,0.05)] shadow-sm">
            {/* Filters */}
            <div className="p-[20px] border-b border-gray-100">
              <div className="grid grid-cols-4 gap-[12px]">
                {/* Search */}
                <div className="col-span-2 relative">
                  <svg className="absolute left-[12px] top-[12px] size-[18px] text-gray-400" fill="none" viewBox="0 0 20 20">
                    <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM19 19l-4.35-4.35"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by product name or brand..."
                    className="w-full h-[42px] rounded-[10px] border-[1px] border-[rgba(0,0,0,0.1)] pl-[38px] pr-[14px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
                  />
                </div>
                {/* Category */}
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="h-[42px] rounded-[10px] border-[1px] border-[rgba(0,0,0,0.1)] px-[12px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
                >
                  {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
                </select>
                {/* Status + Sort */}
                <div className="flex gap-[8px]">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="flex-1 h-[42px] rounded-[10px] border-[1px] border-[rgba(0,0,0,0.1)] px-[10px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
                  >
                    <option value="All">All Status</option>
                    <option value="In Stock">In Stock</option>
                    <option value="Low Stock">Low Stock</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    className="flex-1 h-[42px] rounded-[10px] border-[1px] border-[rgba(0,0,0,0.1)] px-[10px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="stock-asc">Stock ↑</option>
                    <option value="stock-desc">Stock ↓</option>
                    <option value="price">Price</option>
                  </select>
                </div>
              </div>
              <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#4a5565] mt-[10px]">
                Showing <strong>{filteredProducts.length}</strong> of {totalProducts} products
              </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-left py-[12px] px-[20px] uppercase tracking-wide">Product</th>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-left py-[12px] px-[12px] uppercase tracking-wide">Category</th>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-right py-[12px] px-[12px] uppercase tracking-wide">Price</th>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-center py-[12px] px-[12px] uppercase tracking-wide">Stock</th>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-center py-[12px] px-[12px] uppercase tracking-wide">Status</th>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-center py-[12px] px-[12px] uppercase tracking-wide">Rating</th>
                    <th className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] text-[#4a5565] text-center py-[12px] px-[20px] uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-[48px] text-center">
                        <div className="text-[40px] mb-[12px]">🔍</div>
                        <p className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[16px] text-[#2d2d2d]">No products found</p>
                        <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[14px] text-[#4a5565] mt-[4px]">Try adjusting your filters</p>
                      </td>
                    </tr>
                  ) : filteredProducts.map(product => {
                    const status = getStockStatus(product.stock);
                    return (
                      <tr key={product.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${product.stock === 0 ? 'bg-red-50/30' : product.stock <= 50 ? 'bg-yellow-50/20' : ''}`}>
                        {/* Product */}
                        <td className="py-[14px] px-[20px]">
                          <div className="flex items-center gap-[12px]">
                            <div className="size-[44px] bg-[#fffbf0] rounded-[8px] overflow-hidden flex-shrink-0">
                              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <p className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px] text-[#2d2d2d] leading-tight">{product.name}</p>
                              <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[11px] text-[#ff1a75] mt-[2px]">{product.brand}</p>
                              {(product.shades ?? []).length > 0 && (
                                <div className="flex gap-[3px] mt-[4px]">
                                  {product.shades!.slice(0, 6).map(s => (
                                    <span key={s.id} className="size-[10px] rounded-full border border-gray-200" style={{ background: s.color }} title={s.name} />
                                  ))}
                                  {product.shades!.length > 6 && (
                                    <span className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[10px] text-[#4a5565]">+{product.shades!.length - 6}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Category */}
                        <td className="py-[14px] px-[12px]">
                          <span className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#4a5565]">{product.category}</span>
                        </td>
                        {/* Price */}
                        <td className="py-[14px] px-[12px] text-right">
                          <span className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px] text-[#2d2d2d]">₱{product.price}</span>
                        </td>
                        {/* Stock (inline edit) */}
                        <td className="py-[14px] px-[12px] text-center">
                          {editingStockId === product.id ? (
                            <div className="flex items-center justify-center gap-[4px]">
                              <input
                                type="number"
                                value={editStockValue}
                                onChange={e => setEditStockValue(e.target.value)}
                                min="0"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter')  handleSaveStock(product);
                                  if (e.key === 'Escape') setEditingStockId(null);
                                }}
                                className="w-[58px] h-[28px] rounded-[6px] border-[1px] border-[#ff1a75] px-[6px] text-center font-['Plus_Jakarta_Sans:SemiBold',sans-serif] text-[13px] outline-none"
                              />
                              <button onClick={() => handleSaveStock(product)} className="text-green-600 hover:text-green-700 text-[16px]" title="Save">✓</button>
                              <button onClick={() => setEditingStockId(null)} className="text-red-500 hover:text-red-600 text-[14px]" title="Cancel">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEditStock(product.id, product.stock)}
                              className={`font-['Plus_Jakarta_Sans:Bold',sans-serif] font-bold text-[14px] hover:underline cursor-pointer ${
                                product.stock > 50 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'
                              }`}
                              title="Click to edit"
                            >
                              {product.stock}
                            </button>
                          )}
                        </td>
                        {/* Status badge */}
                        <td className="py-[14px] px-[12px]">
                          <div className="flex justify-center">
                            <span className={`flex items-center gap-[6px] px-[10px] py-[4px] rounded-[26843500px] font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[11px] ${status.color}`}>
                              <span className={`size-[6px] rounded-full ${status.dot}`} />
                              {status.label}
                            </span>
                          </div>
                        </td>
                        {/* Rating */}
                        <td className="py-[14px] px-[12px] text-center">
                          <div className="flex items-center justify-center gap-[3px]">
                            <span className="text-yellow-400 text-[13px]">★</span>
                            <span className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px] text-[#2d2d2d]">{product.rating}</span>
                            <span className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[11px] text-[#4a5565]">({product.reviews})</span>
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="py-[14px] px-[20px]">
                          <div className="flex items-center justify-center gap-[6px]">
                            {/* Restock */}
                            <button
                              onClick={() => setModalTarget({ product, mode: 'restock' })}
                              title="Restock"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-[6px] rounded-[8px] transition-colors"
                            >
                              <svg className="size-[17px]" fill="none" viewBox="0 0 20 20">
                                <path d="M10 2v6m0 0l-3-3m3 3l3-3M4 10H2a1 1 0 00-1 1v7a1 1 0 001 1h16a1 1 0 001-1v-7a1 1 0 00-1-1h-2"
                                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            {/* Adjust */}
                            <button
                              onClick={() => setModalTarget({ product, mode: 'adjust' })}
                              title="Adjust Stock"
                              className="text-orange-500 hover:text-orange-600 hover:bg-orange-50 p-[6px] rounded-[8px] transition-colors"
                            >
                              <svg className="size-[17px]" fill="none" viewBox="0 0 20 20">
                                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                              </svg>
                            </button>
                            {/* Edit inline */}
                            <button
                              onClick={() => handleEditStock(product.id, product.stock)}
                              title="Quick Edit Stock"
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-[6px] rounded-[8px] transition-colors"
                            >
                              <svg className="size-[17px]" fill="none" viewBox="0 0 20 20">
                                <path d="M14.166 2.5c.442-.442 1.028-.69 1.644-.69.615 0 1.201.248 1.643.69.442.442.69 1.028.69 1.644 0 .615-.248 1.201-.69 1.643l-9 9-4.5 1.5 1.5-4.5 9-9z"
                                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(product.id, product.name)}
                              title="Delete"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 p-[6px] rounded-[8px] transition-colors"
                            >
                              <svg className="size-[17px]" fill="none" viewBox="0 0 20 20">
                                <path d="M2.5 5h15M6.667 5V3.333C6.667 2.597 7.264 2 8 2h4c.736 0 1.333.597 1.333 1.333V5m2 0v11.667c0 .736-.597 1.333-1.333 1.333H6c-.736 0-1.333-.597-1.333-1.333V5h10z"
                                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════ ALERTS TAB ════════════ */}
        {activeTab === 'alerts' && (
          <div className="space-y-[16px]">
            {alertProducts.length === 0 ? (
              <div className="bg-white rounded-[16px] border-[1px] border-[rgba(0,0,0,0.05)] p-[48px] text-center">
                <div className="text-[48px] mb-[16px]">✅</div>
                <h3 className="font-['Playfair_Display:SemiBold',sans-serif] font-semibold text-[20px] text-[#2d2d2d] mb-[8px]">All Stock Levels Healthy</h3>
                <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[14px] text-[#4a5565]">All products have more than 50 units in stock.</p>
              </div>
            ) : (
              <>
                <div className="bg-yellow-50 border border-yellow-200 rounded-[12px] p-[16px] flex items-start gap-[12px]">
                  <span className="text-[20px]">⚠️</span>
                  <div>
                    <p className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[14px] text-yellow-800">
                      {alertProducts.length} product{alertProducts.length > 1 ? 's' : ''} need attention
                    </p>
                    <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-yellow-700 mt-[2px]">
                      {outOfStock} out of stock · {lowStock - outOfStock} low stock (1–50 units)
                    </p>
                  </div>
                </div>

                {alertProducts.map(product => {
                  const status = getStockStatus(product.stock);
                  return (
                    <div key={product.id} className={`bg-white rounded-[16px] border border-[rgba(0,0,0,0.06)] p-[20px] flex items-center gap-[16px] shadow-sm ${product.stock === 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-yellow-400'}`}>
                      <div className="size-[52px] bg-[#fffbf0] rounded-[10px] overflow-hidden flex-shrink-0">
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[14px] text-[#2d2d2d] truncate">{product.name}</p>
                        <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#ff1a75]">{product.brand}</p>
                        <div className="flex items-center gap-[8px] mt-[4px]">
                          <span className={`text-[12px] font-['Plus_Jakarta_Sans:Bold',sans-serif] font-bold ${product.stock === 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                            {product.stock} units remaining
                          </span>
                          <span className={`inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-full text-[11px] font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold ${status.color}`}>
                            <span className={`size-[5px] rounded-full ${status.dot}`}/>
                            {status.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-[8px]">
                        <button
                          onClick={() => setModalTarget({ product, mode: 'restock' })}
                          className="bg-blue-600 text-white px-[16px] h-[36px] rounded-[26843500px] hover:bg-blue-700 transition-colors font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px]"
                        >
                          Restock
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ════════════ HISTORY TAB ════════════ */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-[16px] border-[1px] border-[rgba(0,0,0,0.05)] shadow-sm">
            <div className="p-[20px] border-b border-gray-100 flex items-center justify-between gap-[12px]">
              <div className="relative flex-1 max-w-[320px]">
                <svg className="absolute left-[12px] top-[11px] size-[16px] text-gray-400" fill="none" viewBox="0 0 20 20">
                  <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM19 19l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  value={historyFilter}
                  onChange={e => setHistoryFilter(e.target.value)}
                  placeholder="Filter by product or reason..."
                  className="w-full h-[38px] rounded-[10px] border-[1px] border-[rgba(0,0,0,0.1)] pl-[36px] pr-[12px] font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[13px] text-[#2d2d2d] outline-none focus:border-[#ff1a75] transition-colors"
                />
              </div>
              {movements.length > 0 && (
                <button
                  onClick={() => { if (window.confirm('Clear all movement history?')) { setMovements([]); saveMovements([]); } }}
                  className="text-red-500 hover:text-red-600 font-['Plus_Jakarta_Sans:Medium',sans-serif] font-medium text-[13px] transition-colors"
                >
                  Clear History
                </button>
              )}
            </div>

            {filteredMovements.length === 0 ? (
              <div className="p-[48px] text-center">
                <div className="text-[48px] mb-[16px]">📋</div>
                <h3 className="font-['Playfair_Display:SemiBold',sans-serif] font-semibold text-[18px] text-[#2d2d2d] mb-[8px]">No Movement History</h3>
                <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[14px] text-[#4a5565]">
                  {movements.length === 0
                    ? 'Stock changes (restocks, adjustments) will appear here.'
                    : 'No results match your filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredMovements.map(mov => (
                  <div key={mov.id} className="flex items-start gap-[16px] px-[20px] py-[14px] hover:bg-gray-50 transition-colors">
                    {/* Icon */}
                    <div className={`size-[36px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[16px] ${
                      mov.type === 'restock'    ? 'bg-blue-100'   :
                      mov.delta > 0            ? 'bg-green-100'  :
                                                 'bg-red-100'
                    }`}>
                      {mov.type === 'restock' ? '📦' : mov.delta > 0 ? '➕' : '➖'}
                    </div>
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-[8px]">
                        <div>
                          <p className="font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold text-[13px] text-[#2d2d2d] leading-tight truncate">
                            {mov.productName}
                            {mov.shade && <span className="font-normal text-[#4a5565]"> · {mov.shade}</span>}
                          </p>
                          <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[12px] text-[#4a5565] mt-[2px]">
                            {mov.reason}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-['Plus_Jakarta_Sans:Bold',sans-serif] font-bold text-[14px] ${mov.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {mov.delta >= 0 ? '+' : ''}{mov.delta}
                          </p>
                          <p className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[11px] text-[#4a5565] mt-[1px]">
                            {mov.before} → {mov.after}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-[8px] mt-[4px]">
                        <span className={`text-[10px] font-['Plus_Jakarta_Sans:SemiBold',sans-serif] font-semibold uppercase px-[6px] py-[1px] rounded-[4px] ${
                          mov.type === 'restock'    ? 'bg-blue-100 text-blue-700'   :
                          mov.type === 'adjustment' ? 'bg-orange-100 text-orange-700' :
                          mov.type === 'sale'       ? 'bg-purple-100 text-purple-700' :
                                                      'bg-gray-100 text-gray-700'
                        }`}>
                          {mov.type}
                        </span>
                        <span className="font-['Plus_Jakarta_Sans:Regular',sans-serif] text-[11px] text-[#4a5565]">
                          {formatDate(mov.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Restock / Adjust Modal ── */}
      {modalTarget && (
        <StockModal
          product={modalTarget.product}
          mode={modalTarget.mode}
          onClose={() => setModalTarget(null)}
          onSave={addMovement}
        />
      )}
    </AdminLayout>
  );
}
