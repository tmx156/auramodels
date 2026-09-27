/**
 * Simplified LeadsNew Component
 * 
 * This is a cleaned-up version using the unified filter configuration.
 * The goal is to have the frontend and backend use the exact same logic.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FiPlus, FiSearch, FiFilter, FiChevronRight, FiUserPlus,
  FiCalendar, FiWifi, FiUpload, FiTrash2, FiX, FiFileText,
  FiCheck, FiPhone, FiMail, FiMapPin, FiUser,
  FiMessageSquare, FiClock, FiEye
} from 'react-icons/fi';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  STATUS_FILTER_CONFIG,
  getDateFilterLabel,
  buildFilterParams,
  getStatusOptions
} from '../utils/leadFilterConfig';

import LazyImage from '../components/LazyImage';
import ImageLightbox from '../components/ImageLightbox';
import BulkCommunicationModal from '../components/BulkCommunicationModal';
import { getOptimizedImageUrl } from '../utils/imageUtils';

// Helper: Get date range for filter
const getDateRange = (dateFilter, customStart, customEnd) => {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const todayMidnight = new Date(todayStr + 'T00:00:00.000Z');

  switch (dateFilter) {
    case 'today':
      const tomorrow = new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
      return {
        start: todayStr + 'T00:00:00.000Z',
        end: tomorrow.toISOString().split('T')[0] + 'T00:00:00.000Z'
      };
    case 'yesterday':
      const yesterday = new Date(todayMidnight.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: yesterday.toISOString().split('T')[0] + 'T00:00:00.000Z',
        end: todayStr + 'T00:00:00.000Z'
      };
    case 'week':
      const weekAgo = new Date(todayMidnight.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        start: weekAgo.toISOString().split('T')[0] + 'T00:00:00.000Z',
        end: now.toISOString()
      };
    case 'month':
      const monthAgo = new Date(todayMidnight.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        start: monthAgo.toISOString().split('T')[0] + 'T00:00:00.000Z',
        end: now.toISOString()
      };
    case 'custom':
      if (customStart && customEnd) {
        return {
          start: customStart + 'T00:00:00.000Z',
          end: customEnd + 'T23:59:59.999Z'
        };
      }
      return null;
    default:
      return null;
  }
};

const LeadsNewSimplified = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isConnected } = useSocket();

  // State
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadCounts, setLeadCounts] = useState({
    total: 0, assigned: 0, booked: 0, attendedFilter: 0, cancelledFilter: 0,
    noShow: 0, noAnswerCall: 0, noAnswerX2: 0, noAnswerX3: 0,
    leftMessage: 0, notInterestedCall: 0, callBack: 0, wrongNumber: 0,
    salesConverted: 0, notQualified: 0, inProgress: 0, rejected: 0
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const leadsPerPage = 30;

  // UI state
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Date range for API
  const dateRange = useMemo(() => 
    getDateRange(dateFilter, customDateStart, customDateEnd),
    [dateFilter, customDateStart, customDateEnd]
  );

  // Status options
  const statusOptions = useMemo(() => 
    getStatusOptions(user?.role),
    [user?.role]
  );

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      // Build params using the unified configuration
      const params = {
        page: currentPage,
        limit: leadsPerPage,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchTerm || undefined,
        ...buildFilterParams(statusFilter, dateRange)
      };

      console.log('🔍 Fetching leads:', { status: statusFilter, dateFilter, params });

      const response = await axios.get('/api/leads', {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000
      });

      setLeads(response.data.leads || []);
      setTotalPages(response.data.totalPages || 1);
      setTotalLeads(response.data.total || 0);
      
      console.log('✅ Leads fetched:', response.data.leads?.length, 'of', response.data.total);
    } catch (error) {
      console.error('❌ Error fetching leads:', error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, leadsPerPage, statusFilter, searchTerm, dateRange]);

  // Fetch counts
  const fetchCounts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Use the same date params as fetchLeads
      const params = buildFilterParams(statusFilter, dateRange);

      const response = await axios.get('/api/stats/leads', {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      setLeadCounts(response.data);
      console.log('📊 Counts updated:', response.data);
    } catch (error) {
      console.error('❌ Error fetching counts:', error);
    }
  }, [dateRange, statusFilter]);

  // Effects
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm, dateFilter, customDateStart, customDateEnd]);

  // Handlers
  const handleStatusChange = (newStatus) => {
    console.log('🔴 Status changed:', newStatus);
    setStatusFilter(newStatus);
    setCurrentPage(1);
    setSelectedLeads([]);
  };

  const handleRowClick = (lead) => {
    navigate(`/leads/${lead.id}`, {
      state: {
        statusFilter,
        searchTerm,
        dateFilter,
        customDateStart,
        customDateEnd,
        ...buildFilterParams(statusFilter, dateRange)
      }
    });
  };

  const handleSelectLead = (leadId) => {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const handleSelectAll = () => {
    if (selectedLeads.length === leads.length && leads.length > 0) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(lead => lead.id));
    }
  };

  // Status color helper
  const getStatusColor = (status) => {
    const colors = {
      'New': 'bg-amber-100 text-amber-800',
      'Booked': 'bg-blue-100 text-blue-800',
      'Attended': 'bg-green-100 text-green-800',
      'Cancelled': 'bg-red-100 text-red-800',
      'No Show': 'bg-gray-100 text-gray-800',
      'Assigned': 'bg-purple-100 text-purple-800',
      'No answer': 'bg-yellow-100 text-yellow-800',
      'Left Message': 'bg-amber-100 text-amber-800',
      'Sales': 'bg-green-600 text-white'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Render
  if (loading && leads.length === 0 && !searchTerm) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <div className="mt-4 text-xl text-gray-700">Loading leads...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/80 border-b border-gray-200/50 shadow-sm">
        <div className="px-6 py-4">
          {/* Title Row */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Leads Management
              </h1>
              <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                {leadCounts.total} Total
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {}}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg flex items-center gap-2"
              >
                <FiUpload className="h-5 w-5" />
                <span>Upload CSV</span>
              </button>
              <button
                onClick={() => {}}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg flex items-center gap-2"
              >
                <FiPlus className="h-5 w-5" />
                <span>Add Lead</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search by name, phone, email, or postcode..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleStatusChange(option.value)}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === option.value
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>{option.label}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                  statusFilter === option.value
                    ? 'bg-white/25 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {leadCounts[option.count] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Date Filter */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-purple-50 border-t border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <FiCalendar className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-semibold text-gray-800">
              {getDateFilterLabel(statusFilter)}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {['today', 'yesterday', 'week', 'month', 'all'].map(filter => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${
                  dateFilter === filter
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {filter === 'all' ? 'All Time' : 
                 filter === 'week' ? 'Last 7 Days' :
                 filter === 'month' ? 'Last 30 Days' :
                 filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
            
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={customDateStart}
                onChange={(e) => {
                  setCustomDateStart(e.target.value);
                  if (e.target.value) setDateFilter('custom');
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customDateEnd}
                onChange={(e) => {
                  setCustomDateEnd(e.target.value);
                  if (e.target.value) setDateFilter('custom');
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="px-6 py-3 bg-white border-b border-gray-200">
        <p className="text-sm text-gray-600">
          Showing <span className="font-semibold">{leads.length}</span> of{' '}
          <span className="font-semibold">{totalLeads}</span> leads
          {statusFilter !== 'all' && (
            <span> with status <span className="font-semibold">{statusFilter}</span></span>
          )}
          {dateFilter !== 'all' && (
            <span> for <span className="font-semibold">{dateFilter}</span></span>
          )}
        </p>
      </div>

      {/* Leads Table */}
      <div className="px-6 py-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedLeads.length === leads.length && leads.length > 0}
                      onChange={handleSelectAll}
                      className="rounded text-blue-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date Booked</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleRowClick(lead)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedLeads.includes(lead.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectLead(lead.id);
                        }}
                        className="rounded text-blue-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {lead.image_url ? (
                          <img
                            src={getOptimizedImageUrl(lead.image_url, 'thumbnail')}
                            alt={lead.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <FiUser className="h-5 w-5 text-gray-500" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{lead.name}</div>
                          <div className="text-sm text-gray-500">{lead.postcode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="text-gray-900">{lead.phone}</div>
                        {lead.email && <div className="text-gray-500">{lead.email}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {lead.date_booked ? new Date(lead.date_booked).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Book lead
                        }}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                      >
                        <FiCalendar className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Empty State */}
        {leads.length === 0 && !loading && (
          <div className="text-center py-20">
            <FiUser className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No leads found</h3>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl disabled:opacity-50"
            >
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = currentPage <= 3 
                  ? i + 1 
                  : currentPage >= totalPages - 2 
                    ? totalPages - 4 + i 
                    : currentPage - 2 + i;
                
                if (pageNum < 1 || pageNum > totalPages) return null;
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-10 h-10 rounded-xl font-medium ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
};

export default LeadsNewSimplified;
