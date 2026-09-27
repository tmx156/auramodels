import React, { useState, useEffect } from 'react';
import { FiEdit, FiPlus, FiX, FiDollarSign, FiToggleLeft, FiToggleRight, FiPackage, FiImage } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const EMPTY_FORM = {
  name: '',
  code: '',
  type: 'main',
  price: '',
  vatInclusive: true,
  vatRate: '20',
  imageCount: '',
  totalValue: '',
  description: '',
  includes: '',
  displayOrder: '0',
  isActive: true,
};

const PriceList = () => {
  const { user } = useAuth();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Toggle loading state per-package
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      setError(null);
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/packages?includeInactive=true', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setPackages(res.data.packages || []);
    } catch (err) {
      console.error('Error fetching packages:', err);
      setError('Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  const mainPackages = packages.filter(p => p.type === 'main');
  const individualPackages = packages.filter(p => p.type === 'individual');

  // Open create modal
  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setModalMode('create');
    setFormError(null);
    setShowModal(true);
  };

  // Open edit modal
  const openEdit = (pkg) => {
    setFormData({
      name: pkg.name || '',
      code: pkg.code || '',
      type: pkg.type || 'main',
      price: String(pkg.price ?? ''),
      vatInclusive: pkg.vatInclusive ?? true,
      vatRate: String(pkg.vatRate ?? '20'),
      imageCount: pkg.imageCount != null ? String(pkg.imageCount) : '',
      totalValue: pkg.totalValue != null ? String(pkg.totalValue) : '',
      description: pkg.description || '',
      includes: Array.isArray(pkg.includes) ? pkg.includes.join(', ') : '',
      displayOrder: String(pkg.displayOrder ?? 0),
      isActive: pkg.isActive ?? true,
    });
    setEditingId(pkg.id);
    setModalMode('edit');
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormError(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim() || !formData.code.trim() || formData.price === '') {
      setFormError('Name, code, and price are required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim(),
        type: formData.type,
        price: parseFloat(formData.price),
        vatInclusive: formData.vatInclusive,
        vatRate: parseFloat(formData.vatRate) || 20,
        imageCount: formData.imageCount ? parseInt(formData.imageCount) : null,
        totalValue: formData.totalValue ? parseFloat(formData.totalValue) : null,
        description: formData.description.trim() || null,
        includes: formData.includes
          ? formData.includes.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        displayOrder: parseInt(formData.displayOrder) || 0,
        isActive: formData.isActive,
      };

      if (modalMode === 'create') {
        await axios.post('/api/packages', payload, { headers });
      } else {
        await axios.put(`/api/packages/${editingId}`, payload, { headers });
      }

      await fetchPackages();
      closeModal();
    } catch (err) {
      console.error('Error saving package:', err);
      setFormError(err.response?.data?.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  // Toggle active/inactive
  const [toggleError, setToggleError] = useState(null);
  const toggleActive = async (pkg) => {
    setTogglingId(pkg.id);
    setToggleError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.put(`/api/packages/${pkg.id}`, { isActive: !pkg.isActive }, { headers });
      await fetchPackages();
    } catch (err) {
      console.error('Error toggling package:', err);
      setToggleError(`Failed to ${pkg.isActive ? 'deactivate' : 'activate'} ${pkg.name}`);
      setTimeout(() => setToggleError(null), 4000);
    } finally {
      setTogglingId(null);
    }
  };

  // Format price as GBP
  const formatPrice = (price) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price);

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Admin access required.</p>
      </div>
    );
  }

  // Package card component
  const PackageCard = ({ pkg }) => (
    <div
      className={`bg-white rounded-xl shadow-sm border p-5 transition-all hover:shadow-md ${
        !pkg.isActive ? 'opacity-50 border-gray-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900 truncate">{pkg.name}</h3>
            {!pkg.isActive && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Inactive</span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">{pkg.code}</p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => openEdit(pkg)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <FiEdit className="h-4 w-4" />
          </button>
          <button
            onClick={() => toggleActive(pkg)}
            disabled={togglingId === pkg.id}
            className={`p-1.5 rounded-lg transition-colors ${
              pkg.isActive
                ? 'text-green-600 hover:text-red-600 hover:bg-red-50'
                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
            }`}
            title={pkg.isActive ? 'Deactivate' : 'Activate'}
          >
            {pkg.isActive ? (
              <FiToggleRight className="h-4 w-4" />
            ) : (
              <FiToggleLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Price */}
      <div className="mb-3">
        <div className="text-2xl font-bold text-gray-900">{formatPrice(pkg.price ?? 0)}</div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span>{pkg.vatInclusive ? 'VAT inclusive' : 'Excl. VAT'}</span>
          <span className="text-gray-300">|</span>
          <span>{pkg.vatRate ?? 20}% VAT</span>
        </div>
        {pkg.totalValue && (
          <div className="text-sm text-gray-400 line-through mt-0.5">
            Total value: {formatPrice(pkg.totalValue)}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <FiImage className="h-3.5 w-3.5 text-gray-400" />
          <span>{pkg.imageCount != null ? `${pkg.imageCount} images` : 'Full Shoot'}</span>
        </div>
        {pkg.description && (
          <p className="text-gray-500 text-xs leading-relaxed">{pkg.description}</p>
        )}
        {pkg.includes && pkg.includes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {pkg.includes.map((item, i) => (
              <span
                key={i}
                className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full"
              >
                {item}
              </span>
            ))}
          </div>
        )}
        <div className="text-xs text-gray-400 pt-1">Order: {pkg.displayOrder ?? 0}</div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiDollarSign className="h-6 w-6 text-blue-600" />
            Price List
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage packages and pricing for the Start Sale flow
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
        >
          <FiPlus className="h-4 w-4" />
          Add Package
        </button>
      </div>

      {toggleError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-center justify-between">
          {toggleError}
          <button onClick={() => setToggleError(null)} className="text-red-400 hover:text-red-600">
            <FiX className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
          <button onClick={fetchPackages} className="ml-2 underline hover:text-red-900">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Main Packages */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FiPackage className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-800">Main Packages</h2>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {mainPackages.length}
              </span>
            </div>
            {mainPackages.length === 0 ? (
              <p className="text-sm text-gray-400">No main packages yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {mainPackages.map(pkg => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            )}
          </section>

          {/* Individual Items */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <FiImage className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-800">Individual Items</h2>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {individualPackages.length}
              </span>
            </div>
            {individualPackages.length === 0 ? (
              <p className="text-sm text-gray-400">No individual items yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {individualPackages.map(pkg => (
                  <PackageCard key={pkg.id} pkg={pkg} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-40" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalMode === 'create' ? 'Add Package' : 'Edit Package'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
            <fieldset disabled={saving}>
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {formError}
                </div>
              )}

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="main">Main Package</option>
                  <option value="individual">Individual Item</option>
                </select>
              </div>

              {/* Name + Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Gold Package"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    placeholder="e.g. gold"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Price + VAT Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (GBP) *</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
                  <input
                    type="number"
                    name="vatRate"
                    value={formData.vatRate}
                    onChange={handleChange}
                    step="0.1"
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* VAT Inclusive toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="vatInclusive"
                  id="vatInclusive"
                  checked={formData.vatInclusive}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="vatInclusive" className="text-sm text-gray-700">
                  Price is VAT inclusive
                </label>
              </div>

              {/* Image Count + Total Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image Count
                    <span className="text-xs text-gray-400 ml-1">(blank = Full Shoot)</span>
                  </label>
                  <input
                    type="number"
                    name="imageCount"
                    value={formData.imageCount}
                    onChange={handleChange}
                    min="0"
                    placeholder="Leave blank for Full Shoot"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Value
                    <span className="text-xs text-gray-400 ml-1">(strikethrough)</span>
                  </label>
                  <input
                    type="number"
                    name="totalValue"
                    value={formData.totalValue}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Optional description"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Includes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Includes
                  <span className="text-xs text-gray-400 ml-1">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  name="includes"
                  value={formData.includes}
                  onChange={handleChange}
                  placeholder="e.g. Headshots, Portfolio, Retouching"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Display Order + Active */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    name="displayOrder"
                    value={formData.displayOrder}
                    onChange={handleChange}
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isActive" className="text-sm text-gray-700">
                      Active
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  )}
                  {modalMode === 'create' ? 'Create Package' : 'Save Changes'}
                </button>
              </div>
            </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceList;
