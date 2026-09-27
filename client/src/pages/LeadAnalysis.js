import React, { useState, useEffect, useCallback } from 'react';
import {
  FiDollarSign, FiTrendingUp, FiUsers, FiTarget,
  FiEdit2, FiTrash2, FiPlus, FiX, FiRefreshCw,
  FiChevronUp, FiChevronDown
} from 'react-icons/fi';
import axios from 'axios';
import { toLocalDateStr } from '../utils/timeUtils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6'];

const LeadAnalysis = () => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toLocalDateStr(d);
  });
  const [endDate, setEndDate] = useState(() => toLocalDateStr(new Date()));
  const [loading, setLoading] = useState(false);
  const [sourceData, setSourceData] = useState(null);
  const [costs, setCosts] = useState([]);
  const [distinctSources, setDistinctSources] = useState([]);
  const [showCostModal, setShowCostModal] = useState(false);
  const [editingCost, setEditingCost] = useState(null);
  const [costForm, setCostForm] = useState({
    lead_source: '', cost_per_lead: '', total_spend: '', period_start: '', period_end: '', notes: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: 'totalLeads', direction: 'desc' });
  const [savingCost, setSavingCost] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const [sourcesRes, costsRes] = await Promise.all([
        axios.get('/api/lead-analytics/sources', { params: { startDate, endDate }, headers }),
        axios.get('/api/lead-analytics/costs', { params: { startDate, endDate }, headers })
      ]);
      setSourceData(sourcesRes.data);
      setCosts(costsRes.data.costs || []);
    } catch (err) {
      console.error('Failed to fetch lead analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchDistinctSources = useCallback(async () => {
    try {
      const res = await axios.get('/api/lead-analytics/distinct-sources', { headers });
      setDistinctSources(res.data.sources || []);
    } catch (err) {
      console.error('Failed to fetch distinct sources:', err);
    }
  }, []);

  useEffect(() => {
    fetchDistinctSources();
  }, [fetchDistinctSources]);

  const handleGenerate = () => {
    fetchSources();
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedSources = sourceData?.sources ? [...sourceData.sources].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    // Handle string comparison (e.g. source name)
    if (typeof aVal === 'string' || typeof bVal === 'string') {
      const aStr = (aVal || '').toLowerCase();
      const bStr = (bVal || '').toLowerCase();
      return sortConfig.direction === 'desc' ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr);
    }
    const aNum = aVal ?? -Infinity;
    const bNum = bVal ?? -Infinity;
    return sortConfig.direction === 'desc' ? bNum - aNum : aNum - bNum;
  }) : [];

  const openCostModal = (source = '') => {
    setEditingCost(null);
    setCostForm({
      lead_source: source,
      cost_per_lead: '',
      total_spend: '',
      period_start: startDate,
      period_end: endDate,
      notes: ''
    });
    setShowCostModal(true);
  };

  const openEditCost = (cost) => {
    setEditingCost(cost);
    setCostForm({
      lead_source: cost.lead_source,
      cost_per_lead: cost.cost_per_lead || '',
      total_spend: cost.total_spend || '',
      period_start: cost.period_start,
      period_end: cost.period_end,
      notes: cost.notes || ''
    });
    setShowCostModal(true);
  };

  const saveCost = async () => {
    if (!costForm.lead_source || !costForm.period_start || !costForm.period_end) return;
    setSavingCost(true);
    try {
      if (editingCost) {
        await axios.put(`/api/lead-analytics/costs/${editingCost.id}`, costForm, { headers });
      } else {
        await axios.post('/api/lead-analytics/costs', costForm, { headers });
      }
      setShowCostModal(false);
      fetchSources();
    } catch (err) {
      console.error('Failed to save cost:', err);
      alert('Failed to save cost entry');
    } finally {
      setSavingCost(false);
    }
  };

  const deleteCost = async (id) => {
    if (!window.confirm('Delete this cost entry?')) return;
    try {
      await axios.delete(`/api/lead-analytics/costs/${id}`, { headers });
      fetchSources();
    } catch (err) {
      console.error('Failed to delete cost:', err);
    }
  };

  const formatCurrency = (val) => {
    if (val == null) return '—';
    return '£' + Number(val).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercent = (val) => {
    if (val == null) return '—';
    return val.toFixed(1) + '%';
  };

  const SortHeader = ({ label, sortKey }) => (
    <th
      className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
      onClick={() => handleSort(sortKey)}
    >
      <span className="inline-flex items-center space-x-1">
        <span>{label}</span>
        {sortConfig.key === sortKey && (
          sortConfig.direction === 'desc' ? <FiChevronDown className="h-3 w-3" /> : <FiChevronUp className="h-3 w-3" />
        )}
      </span>
    </th>
  );

  // Prepare chart data — values must be mutually exclusive for stacked bars
  // Sales ⊂ Attended ⊂ Booked ⊂ Total, so break into non-overlapping segments
  const barChartData = sortedSources.filter(s => s.source !== 'Unknown').slice(0, 10).map(s => ({
    name: s.source?.length > 15 ? s.source.substring(0, 15) + '...' : s.source,
    Sales: s.sales,
    'Attended (no sale)': Math.max(0, s.attended - s.sales),
    'Booked (not attended)': Math.max(0, s.booked - s.attended),
    'Not Booked': Math.max(0, s.totalLeads - s.booked)
  }));

  const pieChartData = sortedSources.filter(s => s.revenue > 0).map((s, i) => ({
    name: s.source,
    value: Math.round(s.revenue * 100) / 100,
    color: CHART_COLORS[i % CHART_COLORS.length]
  }));

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="card bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {loading ? <FiRefreshCw className="h-4 w-4 animate-spin" /> : <FiTarget className="h-4 w-4" />}
              <span>{loading ? 'Loading...' : 'Generate'}</span>
            </button>
          </div>
        </div>
      </div>

      {!sourceData && !loading && (
        <div className="card text-center py-12">
          <FiTarget className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Select a date range and click Generate to view lead source analytics</p>
        </div>
      )}

      {sourceData && (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs font-medium uppercase">Total Leads</p>
                  <p className="text-2xl font-bold mt-1">{sourceData.totals.totalLeads.toLocaleString()}</p>
                </div>
                <FiUsers className="h-8 w-8 text-blue-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-green-500 to-emerald-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs font-medium uppercase">Total Revenue</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(sourceData.totals.totalRevenue)}</p>
                </div>
                <FiDollarSign className="h-8 w-8 text-green-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-orange-500 to-amber-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-xs font-medium uppercase">Total Spend</p>
                  <p className="text-2xl font-bold mt-1">{sourceData.totals.totalSpend > 0 ? formatCurrency(sourceData.totals.totalSpend) : '—'}</p>
                </div>
                <FiDollarSign className="h-8 w-8 text-orange-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-xs font-medium uppercase">Overall ROI</p>
                  <p className="text-2xl font-bold mt-1">{sourceData.totals.overallROI != null ? formatPercent(sourceData.totals.overallROI) : '—'}</p>
                </div>
                <FiTrendingUp className="h-8 w-8 text-purple-200" />
              </div>
            </div>
          </div>

          {/* Source Performance Table */}
          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Source Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <SortHeader label="Source" sortKey="source" />
                    <SortHeader label="Leads" sortKey="totalLeads" />
                    <SortHeader label="Booked" sortKey="booked" />
                    <SortHeader label="Book %" sortKey="bookingRate" />
                    <SortHeader label="Attended" sortKey="attended" />
                    <SortHeader label="Show %" sortKey="showUpRate" />
                    <SortHeader label="Sales" sortKey="sales" />
                    <SortHeader label="Conv %" sortKey="salesConversion" />
                    <SortHeader label="Revenue" sortKey="revenue" />
                    <SortHeader label="Spend" sortKey="totalSpend" />
                    <SortHeader label="ROI" sortKey="roi" />
                    <SortHeader label="Cost/Sale" sortKey="costPerSale" />
                    <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSources.map((s, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className={`py-2.5 px-3 font-medium ${s.source === 'Unknown' ? 'text-gray-400 italic' : 'text-gray-900'}`}>
                        {s.source}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">{s.totalLeads}</td>
                      <td className="py-2.5 px-3 text-gray-700">{s.booked}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs font-medium ${s.bookingRate >= 50 ? 'text-green-600' : s.bookingRate >= 25 ? 'text-amber-600' : 'text-red-500'}`}>
                          {formatPercent(s.bookingRate)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">{s.attended}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs font-medium ${s.showUpRate >= 70 ? 'text-green-600' : s.showUpRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                          {formatPercent(s.showUpRate)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-700 font-medium">{s.sales}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs font-medium ${s.salesConversion >= 30 ? 'text-green-600' : s.salesConversion >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                          {formatPercent(s.salesConversion)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-700 font-medium">{formatCurrency(s.revenue)}</td>
                      <td className="py-2.5 px-3 text-gray-500">{s.totalSpend != null ? formatCurrency(s.totalSpend) : '—'}</td>
                      <td className="py-2.5 px-3">
                        {s.roi != null ? (
                          <span className={`text-xs font-bold ${s.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {s.roi >= 0 ? '+' : ''}{formatPercent(s.roi)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-500">{s.costPerSale != null ? formatCurrency(s.costPerSale) : '—'}</td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => openCostModal(s.source)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Edit cost for this source"
                        >
                          <FiEdit2 className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedSources.length === 0 && (
                    <tr><td colSpan={13} className="py-8 text-center text-gray-400">No data for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts */}
          {(barChartData.length > 0 || pieChartData.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {barChartData.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Leads by Source</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Not Booked" stackId="a" fill="#CBD5E1" />
                      <Bar dataKey="Booked (not attended)" stackId="a" fill="#3B82F6" />
                      <Bar dataKey="Attended (no sale)" stackId="a" fill="#10B981" />
                      <Bar dataKey="Sales" stackId="a" fill="#F59E0B" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {pieChartData.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue by Source</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Cost Management Section */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Cost Entries</h3>
              <button
                onClick={() => openCostModal()}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center space-x-1"
              >
                <FiPlus className="h-4 w-4" />
                <span>Add Cost Entry</span>
              </button>
            </div>
            {costs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase">Cost/Lead</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spend</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((cost) => (
                      <tr key={cost.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-900">{cost.lead_source}</td>
                        <td className="py-2 px-3 text-gray-700">{cost.cost_per_lead != null ? formatCurrency(cost.cost_per_lead) : '—'}</td>
                        <td className="py-2 px-3 text-gray-700">{cost.total_spend != null ? formatCurrency(cost.total_spend) : '—'}</td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{cost.period_start} to {cost.period_end}</td>
                        <td className="py-2 px-3 text-gray-500 text-xs truncate max-w-[200px]">{cost.notes || '—'}</td>
                        <td className="py-2 px-3">
                          <div className="flex space-x-1">
                            <button onClick={() => openEditCost(cost)} className="p-1 hover:bg-gray-100 rounded" title="Edit">
                              <FiEdit2 className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button onClick={() => deleteCost(cost.id)} className="p-1 hover:bg-red-50 rounded" title="Delete">
                              <FiTrash2 className="h-3.5 w-3.5 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-400 py-6 text-sm">No cost entries yet. Add costs to track ROI per lead source.</p>
            )}
          </div>
        </>
      )}

      {/* Cost Entry Modal */}
      {showCostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-md shadow-2xl rounded-2xl bg-white">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">{editingCost ? 'Edit' : 'Add'} Cost Entry</h3>
              <button onClick={() => setShowCostModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <FiX className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  value={costForm.lead_source}
                  onChange={(e) => setCostForm(f => ({ ...f, lead_source: e.target.value }))}
                  list="source-options"
                  placeholder="e.g. Facebook, Google Ads"
                />
                <datalist id="source-options">
                  {distinctSources.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost Per Lead (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    value={costForm.cost_per_lead}
                    onChange={(e) => setCostForm(f => ({ ...f, cost_per_lead: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Spend (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    value={costForm.total_spend}
                    onChange={(e) => setCostForm(f => ({ ...f, total_spend: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    value={costForm.period_start}
                    onChange={(e) => setCostForm(f => ({ ...f, period_start: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    value={costForm.period_end}
                    onChange={(e) => setCostForm(f => ({ ...f, period_end: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  rows={2}
                  value={costForm.notes}
                  onChange={(e) => setCostForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowCostModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveCost}
                disabled={savingCost || !costForm.lead_source || !costForm.period_start || !costForm.period_end}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {savingCost ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadAnalysis;
