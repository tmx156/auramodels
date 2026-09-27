import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FiDollarSign, FiTrendingUp, FiCalendar, FiUser, FiCreditCard, FiFilter, FiEye, FiPlus, FiTrash2, FiMail, FiMessageSquare, FiSend, FiFileText, FiImage, FiCheckCircle, FiClock, FiDownload, FiExternalLink, FiChevronDown, FiShare2, FiCopy, FiCheck } from 'react-icons/fi';
import axios from 'axios';
import { toLocalDateStr } from '../utils/timeUtils';
import SalesCommunicationModal from '../components/SalesCommunicationModal';
import MessageHistory from '../components/MessageHistory';
import OptimizedImage from '../components/OptimizedImage';
import { getOptimizedImageUrl } from '../utils/imageUtils';

const Sales = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'full_payment', 'finance'
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState(toLocalDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(toLocalDateStr(new Date()));
  const [selectedSale, setSelectedSale] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateFinanceModal, setShowCreateFinanceModal] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  
  // Selection and bulk delete states
  const [selectedSales, setSelectedSales] = useState(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Communication modal state
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  
  const [activeTab, setActiveTab] = useState('details');
  const [fullSaleDetails, setFullSaleDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [sharingPhotos, setSharingPhotos] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailSentNotice, setEmailSentNotice] = useState(false);

  const [financeData, setFinanceData] = useState({
    totalAmount: '',
    paymentAmount: '',
    frequency: 'monthly',
    startDate: toLocalDateStr(new Date()),
    notes: ''
  });

  useEffect(() => {
    // For a custom range, wait until both ends are set (and start <= end) before fetching
    if (dateRange === 'custom' && (!customStart || !customEnd || customStart > customEnd)) {
      return;
    }
    fetchSales();
    fetchStats();
  }, [dateRange, filter, customStart, customEnd]);

  // Build the date params sent to the API for the current Period selection
  const buildDateParams = () => {
    const params = { dateRange, paymentType: filter === 'all' ? undefined : filter };
    if (dateRange === 'custom') {
      params.startDate = customStart;
      params.endDate = customEnd;
    }
    return params;
  };

  // Listen for real-time sales updates
  useEffect(() => {
    if (socket) {
      // Listen for sales deletion events
      socket.on('sales_deleted', (data) => {
        console.log('📡 Received sales_deleted event:', data);
        // Refresh sales data when sales are deleted
        fetchSales();
        fetchStats();
      });

      // Listen for new sales created
      socket.on('sale_created', (data) => {
        console.log('📡 Received sale_created event:', data);
        // Refresh sales data when new sales are created
        fetchSales();
        fetchStats();
      });

      return () => {
        socket.off('sales_deleted');
        socket.off('sale_created');
      };
    }
  }, [socket]);

  const fetchSales = async () => {
    try {
      const params = buildDateParams();
      console.log('🔍 Fetching sales with params:', params);
      const response = await axios.get('/api/sales', { params });
      console.log('📊 Sales data received:', response.data);

      // DEBUG: Check user attribution in received data
      if (response.data && response.data.length > 0) {
        console.log('🔍 SALES USER ATTRIBUTION DEBUG:');
        response.data.slice(0, 3).forEach((sale, i) => {
          const displayName = sale.user_name || (sale.user_id ? `User ${sale.user_id.slice(-4)}` : 'System');
          console.log(`   Sale ${i+1}: ID=${sale.id.slice(-8)}, user_id=${sale.user_id}, user_name="${sale.user_name}", display="${displayName}"`);
        });
      }

      setSales(response.data);
    } catch (error) {
      console.error('❌ Error fetching sales:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const params = buildDateParams();
      console.log('📈 Fetching stats with params:', params);
      const response = await axios.get('/api/sales/stats', { params });
      console.log('📊 Stats data received:', response.data);
      setStats(response.data);
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleDetails = async (saleId) => {
    try {
      setLoadingDetails(true);
      const response = await axios.get(`/api/sales/${saleId}/details`);
      if (response.data.success) {
        setFullSaleDetails(response.data.sale);
      }
    } catch (error) {
      console.error('❌ Error fetching sale details:', error);
      setFullSaleDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleViewDetails = async (sale) => {
    setSelectedSale(sale);
    setFullSaleDetails(null);
    setActiveTab('details');
    setShowAllPhotos(false);
    setShareLink(null);
    setLinkCopied(false);
    setEmailSentNotice(false);
    setShowModal(true);
    // Fetch full details including contract and photos
    await fetchSaleDetails(sale.id);
  };

  const handleCreateFinance = (sale) => {
    setSelectedSale(sale);
    setFinanceData({
      totalAmount: sale.amount,
      paymentAmount: '',
      frequency: 'monthly',
      startDate: toLocalDateStr(new Date()),
      notes: `Finance agreement for ${sale.lead_name}`
    });
    setShowCreateFinanceModal(true);
  };

  const submitFinanceAgreement = async () => {
    try {
      await axios.post('/api/finance', {
        leadId: selectedSale.lead_id,
        totalAmount: parseFloat(financeData.totalAmount),
        paymentAmount: parseFloat(financeData.paymentAmount),
        frequency: financeData.frequency,
        startDate: financeData.startDate,
        notes: financeData.notes
      });
      
      setShowCreateFinanceModal(false);
      setFinanceData({
        totalAmount: '',
        paymentAmount: '',
        frequency: 'monthly',
        startDate: toLocalDateStr(new Date()),
        notes: ''
      });
      
      // Refresh sales data and stats
      fetchSales();
      fetchStats();
      
    } catch (error) {
      console.error('Error creating finance agreement:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const sharePhotos = async (sale, photos) => {
    if (!sale || !photos?.length) return;
    setSharingPhotos(true);
    setShareLink(null);
    setLinkCopied(false);
    try {
      const galleryUrl = `${window.location.origin}/gallery/`;
      const res = await axios.post('/api/shared-gallery', {
        sale_id: sale.id,
        lead_id: sale.lead_id,
        photo_ids: photos.map(p => p.id),
        send_email: true,
        gallery_url_prefix: galleryUrl
      });
      if (res.data.success) {
        const url = `${window.location.origin}/gallery/${res.data.token}`;
        setShareLink(url);
        if (res.data.email_sent) {
          setEmailSentNotice(true);
          setTimeout(() => setEmailSentNotice(false), 4000);
        }
      }
    } catch (err) {
      console.error('Error creating share link:', err);
      alert('Failed to create share link');
    } finally {
      setSharingPhotos(false);
    }
  };

  const copyShareLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const resendEmailReceipt = async (sale) => {
    if (!sale) return;
    try {
      setSendingEmail(true);
      await axios.post(
        `/api/sales/${sale.id}/send-receipt/email`,
        { email: sale.lead_email },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      alert('Email receipt sent');
    } catch (error) {
      console.error('Failed to resend email receipt:', error);
      alert('Failed to send email receipt');
    } finally {
      setSendingEmail(false);
    }
  };

  const resendSmsReceipt = async (sale) => {
    if (!sale) return;
    try {
      setSendingSms(true);
      await axios.post(
        `/api/sales/${sale.id}/send-receipt/sms`,
        { phone: sale.lead_phone },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      alert('SMS receipt sent');
    } catch (error) {
      console.error('Failed to resend sms receipt:', error);
      alert('Failed to send SMS receipt');
    } finally {
      setSendingSms(false);
    }
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm('Are you sure you want to delete this sale? This action cannot be undone.')) {
      return;
    }

    try {
      console.log('🗑️ Attempting to delete sale:', saleId);
      const response = await axios.delete(`/api/sales/${saleId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      console.log('📥 Delete response:', response);
      console.log('📥 Response data:', response.data);

      if (response.data && response.data.message) {
        console.log('✅ Delete successful:', response.data.message);
        alert(response.data.message);
        // Refresh data
        await fetchSales();
        await fetchStats();
      } else {
        console.log('⚠️ Unexpected response format:', response.data);
        // Still refresh data in case deletion was successful
        await fetchSales();
        await fetchStats();
        alert('Sale deleted successfully');
      }
    } catch (error) {
      console.error('❌ Error deleting sale:', error);
      console.error('❌ Error response:', error.response);
      console.error('❌ Error response data:', error.response?.data);
      
      // Check if it's a network error or server error
      if (error.response) {
        // Server responded with error status
        const errorMessage = error.response.data?.message || error.response.data?.error || 'Unknown server error';
        
        // Avoid recursive error messages
        if (errorMessage.includes('Failed to delete sale')) {
          alert('Failed to delete sale: ' + (error.response.data?.error || error.response.data?.details || 'Unknown error'));
        } else {
          alert('Failed to delete sale: ' + errorMessage);
        }
      } else if (error.request) {
        // Request was made but no response received
        alert('Failed to delete sale: No response from server');
      } else {
        // Something else happened
        alert('Failed to delete sale: ' + error.message);
      }
    }
  };

  const getPaymentMethodColor = (paymentMethod) => {
    // Type guard: ensure paymentMethod is a valid string
    if (!paymentMethod || typeof paymentMethod !== 'string') {
      return 'bg-gray-100 text-gray-800';
    }
    switch (paymentMethod.toLowerCase()) {
      case 'card': return 'bg-green-100 text-green-800';
      case 'cash': return 'bg-yellow-100 text-yellow-800';
      case 'finance': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentMethodLabel = (paymentMethod) => {
    // Type guard: ensure paymentMethod is a valid string
    if (!paymentMethod || typeof paymentMethod !== 'string') {
      return 'Unknown';
    }
    switch (paymentMethod.toLowerCase()) {
      case 'card': return 'Card';
      case 'cash': return 'Cash';
      case 'finance': return 'Finance';
      default: return paymentMethod;
    }
  };

  // Selection helper functions
  const handleSelectSale = (saleId) => {
    const newSelected = new Set(selectedSales);
    if (newSelected.has(saleId)) {
      newSelected.delete(saleId);
    } else {
      newSelected.add(saleId);
    }
    setSelectedSales(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSales.size === filteredSales.length) {
      setSelectedSales(new Set());
    } else {
      setSelectedSales(new Set(filteredSales.map(sale => sale.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSales.size === 0) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch('/api/sales/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ saleIds: Array.from(selectedSales) })
      });

      console.log('📥 Bulk delete response:', response);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log('📥 Bulk delete response data:', responseData);
        
        // Refresh data
        await fetchSales();
        await fetchStats();
        setSelectedSales(new Set());
        setShowBulkDeleteModal(false);
        
        const message = responseData.message || `Successfully deleted ${selectedSales.size} sales`;
        alert(message);
        console.log(`✅ Successfully deleted ${selectedSales.size} sales`);
      } else {
        const errorData = await response.json();
        console.error('❌ Failed to delete sales:', errorData);
        
        // Avoid recursive error messages
        const errorMessage = errorData.message || errorData.error || 'Unknown error';
        if (errorMessage.includes('Failed to delete sales')) {
          alert('Failed to delete sales: ' + (errorData.error || errorData.details || 'Unknown error'));
        } else {
          alert('Failed to delete sales: ' + errorMessage);
        }
      }
    } catch (error) {
      console.error('Error deleting sales:', error);
      alert('Error deleting sales. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredSales = sales.filter(sale => {
    if (filter === 'all') return true;
    return sale.payment_type === filter;
  });

  console.log('🔍 Debug Info:', {
    totalSales: sales.length,
    filteredSales: filteredSales.length,
    currentFilter: filter,
    stats: stats,
    salesData: sales.map(s => ({ name: s.lead_name, amount: s.amount, paymentType: s.payment_type }))
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                Sales Overview
              </h1>
              <p className="text-gray-600 text-base sm:text-lg">Track completed sales and revenue performance</p>
            </div>
            <div className="flex items-center sm:justify-end">
              <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-200 whitespace-nowrap">
                <span className="text-sm text-gray-600">Last updated: </span>
                <span className="text-sm font-medium text-blue-600">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className={`grid gap-4 sm:gap-6 mb-6 sm:mb-8 ${user?.role === 'admin' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
          <div className="bg-white/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-green-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 sm:p-4 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl shadow-lg">
                <FiDollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <div className="ml-4 sm:ml-6 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 break-words">{formatCurrency(stats.totalRevenue || 0)}</p>
                {user?.role === 'admin' && <p className="text-xs text-green-600 font-medium mt-1">↗ +12% from last month</p>}
              </div>
            </div>
          </div>

          {user?.role === 'admin' && (
            <div className="bg-white/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-blue-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center">
                <div className="flex-shrink-0 p-3 sm:p-4 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl shadow-lg">
                  <FiTrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="ml-4 sm:ml-6 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Sales</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 break-words">{stats.totalSales || 0}</p>
                  <p className="text-xs text-blue-600 font-medium mt-1">↗ +8% from last month</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-purple-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 sm:p-4 bg-gradient-to-br from-purple-400 to-purple-600 rounded-2xl shadow-lg">
                <FiCreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <div className="ml-4 sm:ml-6 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  {user?.role === 'admin' ? 'Avg Sale Value' : 'Your Avg Sale'}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 break-words">{formatCurrency(stats.averageSaleValue || 0)}</p>
                {user?.role === 'admin' && <p className="text-xs text-purple-600 font-medium mt-1">↗ +5% from last month</p>}
              </div>
            </div>
          </div>

          {user?.role === 'admin' && (
            <div className="bg-white/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-orange-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center">
                <div className="flex-shrink-0 p-3 sm:p-4 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl shadow-lg">
                  <FiCalendar className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="ml-4 sm:ml-6 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Finance Agreements</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 break-words">{stats.financeAgreements || 0}</p>
                  <p className="text-xs text-orange-600 font-medium mt-1">↗ +3% from last month</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 sm:mb-8">
          <div className="bg-white/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-gray-200">
            <div className="flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:gap-6 lg:items-center">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="text-sm font-semibold text-gray-700 flex items-center">
                  <FiFilter className="mr-2 h-4 w-4" />
                  Payment Type:
                </label>
                {['all', 'full_payment', 'finance'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all duration-200 ${
                      filter === type
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                    }`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="text-sm font-semibold text-gray-700 flex items-center">
                  <FiCalendar className="mr-2 h-4 w-4" />
                  Period:
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <option value="today">Today</option>
                  <option value="this_week">This Week</option>
                  <option value="last_week">Last Week</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="this_quarter">This Quarter</option>
                  <option value="this_year">This Year</option>
                  <option value="custom">Custom Range</option>
                </select>

                {dateRange === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd || undefined}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="flex-1 min-w-[8.5rem] px-3 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                    />
                    <span className="text-gray-500 text-sm">to</span>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart || undefined}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="flex-1 min-w-[8.5rem] px-3 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* Sales Table */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-4 sm:px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center">
                <FiTrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 mr-2 sm:mr-3" />
                Sales History
              </h2>

              {/* Bulk Actions */}
              {selectedSales.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="bg-blue-100 px-3 py-1 rounded-full">
                    <span className="text-sm font-medium text-blue-700">
                      {selectedSales.size} selected
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCommunicationModal(true)}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <FiSend className="h-4 w-4 flex-shrink-0" />
                    <span className="font-semibold whitespace-nowrap">Send Communication</span>
                  </button>
                  <button
                    onClick={() => setShowBulkDeleteModal(true)}
                    className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-3 sm:px-4 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <FiTrash2 className="h-4 w-4 flex-shrink-0" />
                    <span className="font-semibold whitespace-nowrap">Delete Selected</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        
          {/* Empty state */}
          {filteredSales.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-gray-100 mb-4">
                <FiTrendingUp className="h-7 w-7 text-gray-400" />
              </div>
              <p className="text-gray-900 font-semibold">No sales found</p>
              <p className="text-gray-500 text-sm mt-1">Try adjusting the period or payment-type filters above.</p>
            </div>
          ) : (
            <>
              {/* Desktop / tablet: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                  <tr>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-12">
                      <input
                        type="checkbox"
                        checked={selectedSales.size === filteredSales.length && filteredSales.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded shadow-sm"
                      />
                    </th>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Sale Date
                    </th>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Payment Method
                    </th>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">
                      Sales Agent
                    </th>
                    <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className={`hover:bg-blue-50/50 transition-colors duration-200 ${selectedSales.has(sale.id) ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedSales.has(sale.id)}
                          onChange={() => handleSelectSale(sale.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                              <FiUser className="h-5 w-5 text-gray-600" />
                            </div>
                          </div>
                          <div className="ml-4 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {sale.lead_name || 'Unknown'}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {sale.lead_email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(sale.sale_created_at || sale.created_at)}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(sale.amount)}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentMethodColor(sale.payment_method)}`}>
                          {getPaymentMethodLabel(sale.payment_method)}
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        <div className="text-sm text-gray-900">
                          {sale.user_name || (sale.user_id ? `User ${sale.user_id.slice(-4)}` : 'System')}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewDetails(sale)}
                            className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-all duration-200 hover:scale-110 shadow-sm hover:shadow-md"
                            title="View Details"
                          >
                            <FiEye className="h-4 w-4" />
                          </button>
                          {sale.payment_type === 'full_payment' && (
                            <button
                              onClick={() => handleCreateFinance(sale)}
                              className="p-2 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg transition-all duration-200 hover:scale-110 shadow-sm hover:shadow-md"
                              title="Convert to Finance"
                            >
                              <FiPlus className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteSale(sale.id)}
                            className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-all duration-200 hover:scale-110 shadow-sm hover:shadow-md"
                            title="Delete Sale"
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredSales.map((sale) => (
                <div key={sale.id} className={`p-4 ${selectedSales.has(sale.id) ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedSales.has(sale.id)}
                      onChange={() => handleSelectSale(sale.id)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {sale.lead_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {sale.lead_email}
                          </div>
                        </div>
                        <div className="text-base font-bold text-gray-900 whitespace-nowrap">
                          {formatCurrency(sale.amount)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-600">
                        <span className="flex items-center">
                          <FiCalendar className="h-3.5 w-3.5 mr-1 text-gray-400" />
                          {formatDate(sale.sale_created_at || sale.created_at)}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 font-semibold rounded-full ${getPaymentMethodColor(sale.payment_method)}`}>
                          {getPaymentMethodLabel(sale.payment_method)}
                        </span>
                        <span className="flex items-center">
                          <FiUser className="h-3.5 w-3.5 mr-1 text-gray-400" />
                          {sale.user_name || (sale.user_id ? `User ${sale.user_id.slice(-4)}` : 'System')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleViewDetails(sale)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg text-xs font-medium transition-colors"
                          title="View Details"
                        >
                          <FiEye className="h-4 w-4" /> View
                        </button>
                        {sale.payment_type === 'full_payment' && (
                          <button
                            onClick={() => handleCreateFinance(sale)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg text-xs font-medium transition-colors"
                            title="Convert to Finance"
                          >
                            <FiPlus className="h-4 w-4" /> Finance
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSale(sale.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-xs font-medium transition-colors ml-auto"
                          title="Delete Sale"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
          )}
        </div>

        {/* View Details Modal */}
        {showModal && selectedSale && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-0 w-11/12 md:w-4/5 lg:w-3/4 shadow-2xl rounded-2xl bg-white overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white">Sale Details</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-white hover:text-gray-200 transition-colors duration-200"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex space-x-4 mt-4">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                      activeTab === 'details'
                        ? 'bg-white text-blue-600 shadow-md'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    Sale Details
                  </button>
                  <button
                    onClick={() => setActiveTab('communications')}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                      activeTab === 'communications'
                        ? 'bg-white text-blue-600 shadow-md'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    Communications ({Array.isArray(selectedSale?.lead?.booking_history) ? selectedSale.lead.booking_history.filter(h => ['EMAIL_SENT','EMAIL_RECEIVED','SMS_SENT','SMS_RECEIVED'].includes(h.action)).length : 0})
                  </button>
                </div>
              </div>
              <div className="p-6">
                {activeTab === 'details' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-2xl border border-blue-200">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center">
                          <FiUser className="h-5 w-5 text-blue-600 mr-2" />
                          Customer Information
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Name:</span>
                            <span className="text-gray-900">{selectedSale.lead_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Email:</span>
                            <span className="text-gray-900">{selectedSale.lead_email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Phone:</span>
                            <span className="text-gray-900">{selectedSale.lead_phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-2xl border border-green-200">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center">
                          <FiDollarSign className="h-5 w-5 text-green-600 mr-2" />
                          Sale Information
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Sale Date:</span>
                            <span className="text-gray-900">{formatDate(selectedSale.sale_created_at || selectedSale.created_at)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Amount:</span>
                            <span className="text-gray-900 font-bold text-green-600">{formatCurrency(selectedSale.amount)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-gray-600">Payment Method:</span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentMethodColor(selectedSale.payment_method)}`}>
                              {getPaymentMethodLabel(selectedSale.payment_method)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Sales Agent:</span>
                            <span className="text-gray-900">{selectedSale.user_name}</span>
                          </div>
                          {fullSaleDetails?.contract?.contract_data?.authCode && (
                            <div className="flex justify-between">
                              <span className="font-semibold text-gray-600">Auth Code:</span>
                              <span className="text-gray-900 font-mono bg-gray-100 px-2 py-0.5 rounded">{fullSaleDetails.contract.contract_data.authCode}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Contract Section */}
                    <div className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-200">
                      <h4 className="font-bold text-gray-800 mb-4 flex items-center">
                        <FiFileText className="h-5 w-5 text-purple-600 mr-2" />
                        Contract Information
                      </h4>
                      {loadingDetails ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                          <span className="ml-2 text-gray-600">Loading contract details...</span>
                        </div>
                      ) : fullSaleDetails?.contract ? (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-gray-600">Status:</span>
                            <span className={`flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                              fullSaleDetails.contract.status === 'signed'
                                ? 'bg-green-100 text-green-800'
                                : fullSaleDetails.contract.status === 'sent'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {fullSaleDetails.contract.status === 'signed' ? (
                                <><FiCheckCircle className="h-4 w-4 mr-1" /> Signed</>
                              ) : fullSaleDetails.contract.status === 'sent' ? (
                                <><FiClock className="h-4 w-4 mr-1" /> Pending Signature</>
                              ) : (
                                fullSaleDetails.contract.status
                              )}
                            </span>
                          </div>
                          {fullSaleDetails.contract.signed_at && (
                            <div className="flex justify-between">
                              <span className="font-semibold text-gray-600">Signed At:</span>
                              <span className="text-gray-900">{formatDate(fullSaleDetails.contract.signed_at)}</span>
                            </div>
                          )}
                          {fullSaleDetails.contract.signed_pdf_url ? (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-gray-600">
                                  {fullSaleDetails.contract.contract_data?.financePdfUrl ? 'Invoice & Order Form:' : 'Signed Contract:'}
                                </span>
                                <a
                                  href={fullSaleDetails.contract.signed_pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-md hover:shadow-lg"
                                >
                                  <FiDownload className="h-4 w-4 mr-2" />
                                  Download PDF
                                </a>
                              </div>
                              {fullSaleDetails.contract.contract_data?.financePdfUrl && (
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-gray-600">Finance Agreement:</span>
                                  <a
                                    href={fullSaleDetails.contract.contract_data.financePdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-200 shadow-md hover:shadow-lg"
                                  >
                                    <FiDownload className="h-4 w-4 mr-2" />
                                    Download PDF
                                  </a>
                                </div>
                              )}
                              {fullSaleDetails.contract.contract_data?.cardPayPdfUrl && (
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-gray-600">Card Pay Details:</span>
                                  <a
                                    href={fullSaleDetails.contract.contract_data.cardPayPdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg hover:from-red-600 hover:to-pink-600 transition-all duration-200 shadow-md hover:shadow-lg"
                                  >
                                    <FiDownload className="h-4 w-4 mr-2" />
                                    Download PDF
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : fullSaleDetails.contract.status === 'signed' && fullSaleDetails.contract.contract_token ? (
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-gray-600">Signed Contract:</span>
                              <a
                                href={`/api/contracts/preview/${fullSaleDetails.contract.contract_token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-200 shadow-md hover:shadow-lg"
                              >
                                <FiEye className="h-4 w-4 mr-2" />
                                View PDF
                              </a>
                            </div>
                          ) : fullSaleDetails.contract.status === 'signed' ? (
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-gray-600">Signed Contract:</span>
                              <span className="text-orange-600 text-sm">PDF not available - contact admin</span>
                            </div>
                          ) : null}
                          {fullSaleDetails.contract.signing_url && fullSaleDetails.contract.status !== 'signed' && (
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-gray-600">Signing Link:</span>
                              <a
                                href={fullSaleDetails.contract.signing_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-200 shadow-md hover:shadow-lg"
                              >
                                <FiExternalLink className="h-4 w-4 mr-2" />
                                Open Signing Page
                              </a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">No contract associated with this sale</p>
                      )}
                    </div>

                    {/* Card Payment Details - Finance only */}
                    {fullSaleDetails?.contract?.contract_data?.cardPayDetails && (
                      <div className="mt-6 bg-gradient-to-br from-red-50 to-orange-50 p-6 rounded-2xl border border-red-200">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center">
                          <FiCreditCard className="h-5 w-5 text-red-600 mr-2" />
                          Card Payment Details
                        </h4>
                        <div className="space-y-2">
                          {[
                            { label: 'Full Name on Card', value: fullSaleDetails.contract.contract_data.cardPayDetails.fullNameOnCard },
                            { label: 'Card Number', value: fullSaleDetails.contract.contract_data.cardPayDetails.cardNumber },
                            { label: 'Expiry Date', value: fullSaleDetails.contract.contract_data.cardPayDetails.expiryDate },
                            { label: 'Number of Payments', value: fullSaleDetails.contract.contract_data.cardPayDetails.numberOfPayments },
                            { label: 'Payment Amount', value: fullSaleDetails.contract.contract_data.cardPayDetails.paymentAmount ? `£${fullSaleDetails.contract.contract_data.cardPayDetails.paymentAmount}` : '' },
                            { label: 'Total Amount', value: fullSaleDetails.contract.contract_data.cardPayDetails.totalAmount ? `£${fullSaleDetails.contract.contract_data.cardPayDetails.totalAmount}` : '' }
                          ].filter(f => f.value).map(field => (
                            <div key={field.label} className="flex justify-between">
                              <span className="font-semibold text-gray-600">{field.label}:</span>
                              <span className="text-gray-900 font-mono bg-gray-100 px-2 py-0.5 rounded">{field.value}</span>
                            </div>
                          ))}
                          {fullSaleDetails.contract.contract_data.cardPayDetails.signature && (
                            <div className="flex justify-between items-center pt-2 border-t">
                              <span className="font-semibold text-gray-600">Signed:</span>
                              <span className="text-green-600 flex items-center"><FiCheckCircle className="h-4 w-4 mr-1" /> Yes</span>
                            </div>
                          )}
                          {fullSaleDetails.contract.contract_data.cardPayPdfUrl && (
                            <div className="flex justify-between items-center pt-2 border-t">
                              <span className="font-semibold text-gray-600">Card Pay PDF:</span>
                              <a href={fullSaleDetails.contract.contract_data.cardPayPdfUrl}
                                target="_blank" rel="noopener noreferrer"
                                className="text-red-600 hover:text-red-700 flex items-center font-medium">
                                <FiDownload className="h-4 w-4 mr-1" /> Download
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selected Photos Section */}
                    <div className="mt-6 bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-2xl border border-orange-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-800 flex items-center">
                          <FiImage className="h-5 w-5 text-orange-600 mr-2" />
                          Selected Photos
                          {fullSaleDetails?.selected_photos?.length > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-orange-200 text-orange-800 text-xs rounded-full">
                              {fullSaleDetails.selected_photos.length} photos
                            </span>
                          )}
                        </h4>
                        {fullSaleDetails?.selected_photos?.length > 0 && !shareLink && (
                          <button
                            onClick={() => sharePhotos(selectedSale, fullSaleDetails.selected_photos)}
                            disabled={sharingPhotos}
                            className="flex items-center px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors duration-200 shadow-sm disabled:opacity-50"
                          >
                            {sharingPhotos ? (
                              <>
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-1.5"></div>
                                Creating...
                              </>
                            ) : (
                              <>
                                <FiShare2 className="h-3.5 w-3.5 mr-1.5" />
                                Share with Client
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {shareLink && (
                        <div className="mb-4">
                          {emailSentNotice && (
                            <div className="mb-2 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                              <FiMail className="h-4 w-4" />
                              Gallery link emailed to client
                            </div>
                          )}
                          <div className="flex items-center gap-2 bg-white border border-orange-200 rounded-lg p-3">
                            <input
                              type="text"
                              readOnly
                              value={shareLink}
                              className="flex-1 text-sm text-gray-700 bg-transparent outline-none truncate"
                            />
                            <button
                              onClick={copyShareLink}
                              className={`flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 ${linkCopied ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                            >
                              {linkCopied ? <><FiCheck className="h-3.5 w-3.5 mr-1" /> Copied</> : <><FiCopy className="h-3.5 w-3.5 mr-1" /> Copy</>}
                            </button>
                            <a
                              href={shareLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-200"
                            >
                              <FiExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                            </a>
                          </div>
                        </div>
                      )}
                      {loadingDetails ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                          <span className="ml-2 text-gray-600">Loading photos...</span>
                        </div>
                      ) : fullSaleDetails?.selected_photos?.length > 0 ? (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {(showAllPhotos
                              ? fullSaleDetails.selected_photos
                              : fullSaleDetails.selected_photos.slice(0, 4)
                            ).map((photo) => (
                              <div key={photo.id} className="relative group">
                                <OptimizedImage
                                  src={getOptimizedImageUrl(photo.cloudinary_secure_url || photo.cloudinary_url, 'thumbnail')}
                                  alt={photo.filename || 'Selected photo'}
                                  className="w-full h-32 object-cover rounded-lg shadow-md group-hover:shadow-xl transition-all duration-200"
                                  fallbackSrc={photo.cloudinary_secure_url || photo.cloudinary_url}
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center">
                                  <a
                                    href={photo.cloudinary_secure_url || photo.cloudinary_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="opacity-0 group-hover:opacity-100 p-2 bg-white rounded-full shadow-lg transition-all duration-200"
                                  >
                                    <FiExternalLink className="h-4 w-4 text-gray-700" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                          {fullSaleDetails.selected_photos.length > 4 && !showAllPhotos && (
                            <button
                              onClick={() => setShowAllPhotos(true)}
                              className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors duration-200"
                            >
                              <FiChevronDown className="h-4 w-4" />
                              <span>Show {fullSaleDetails.selected_photos.length - 4} more photos</span>
                            </button>
                          )}
                          {showAllPhotos && fullSaleDetails.selected_photos.length > 4 && (
                            <button
                              onClick={() => setShowAllPhotos(false)}
                              className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors duration-200"
                            >
                              <FiChevronDown className="h-4 w-4 rotate-180" />
                              <span>Show less</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-500 italic">No photos selected for this sale</p>
                      )}
                    </div>

                    {selectedSale.notes && !fullSaleDetails?.parsed_notes?.auto_created && (
                      <div className="mt-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h4 className="font-bold text-gray-800 mb-2">Notes</h4>
                        <p className="text-gray-600">{selectedSale.notes}</p>
                      </div>
                    )}

                    <div className="flex justify-end space-x-3 mt-8">
                      <button
                        onClick={() => resendEmailReceipt(selectedSale)}
                        disabled={sendingEmail}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 flex items-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                        title="Resend Email Receipt"
                      >
                        <FiMail className="h-4 w-4 mr-2" />
                        {sendingEmail ? 'Sending...' : 'Resend Email'}
                      </button>
                      <button
                        onClick={() => resendSmsReceipt(selectedSale)}
                        disabled={sendingSms}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 disabled:opacity-50 flex items-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                        title="Resend SMS Receipt"
                      >
                        <FiMessageSquare className="h-4 w-4 mr-2" />
                        {sendingSms ? 'Sending...' : 'Resend SMS'}
                      </button>
                      <button
                        onClick={() => {
                          setShowModal(false);
                          handleDeleteSale(selectedSale.id);
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 flex items-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                        title="Delete Sale"
                      >
                        <FiTrash2 className="h-4 w-4 mr-2" />
                        Delete Sale
                      </button>
                      <button
                        onClick={() => setShowModal(false)}
                        className="px-6 py-3 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl hover:from-gray-500 hover:to-gray-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        Close
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Communications Tab Content */}
                    <MessageHistory
                      bookingHistory={selectedSale?.lead?.booking_history}
                      title={`Communications History for ${selectedSale.lead_name}`}
                      maxHeight="max-h-96"
                    />

                    <div className="flex justify-end space-x-3 mt-8">
                      <button
                        onClick={() => setShowModal(false)}
                        className="px-6 py-3 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl hover:from-gray-500 hover:to-gray-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        Close
                      </button>
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Create Finance Modal */}
      {showCreateFinanceModal && selectedSale && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-2/3 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create Finance Agreement</h3>
              <p className="text-sm text-gray-600 mb-4">
                Convert this sale to a finance agreement for {selectedSale.lead?.name}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                  <input
                    type="number"
                    value={financeData.totalAmount}
                    onChange={(e) => setFinanceData({...financeData, totalAmount: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {financeData.frequency === 'weekly' ? 'Weekly' : 'Monthly'} Payment Amount
                  </label>
                  <input
                    type="number"
                    value={financeData.paymentAmount}
                    onChange={(e) => setFinanceData({...financeData, paymentAmount: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter custom payment amount"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Set how much the customer will pay each {financeData.frequency === 'weekly' ? 'week' : 'month'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Frequency</label>
                  <select
                    value={financeData.frequency}
                    onChange={(e) => setFinanceData({...financeData, frequency: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={financeData.startDate}
                    onChange={(e) => setFinanceData({...financeData, startDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              {/* Payment Calculation Display */}
              {financeData.totalAmount && financeData.paymentAmount && (
                <div className="bg-gray-50 p-4 rounded-md border">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Payment Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Total Amount:</span>
                      <span className="font-medium ml-2">£{parseFloat(financeData.totalAmount).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">{financeData.frequency === 'weekly' ? 'Weekly' : 'Monthly'} Payment:</span>
                      <span className="font-medium ml-2">£{parseFloat(financeData.paymentAmount || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Number of Payments:</span>
                      <span className="font-medium ml-2">
                        {financeData.paymentAmount > 0 ? Math.ceil(parseFloat(financeData.totalAmount) / parseFloat(financeData.paymentAmount)) : 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Duration:</span>
                      <span className="font-medium ml-2">
                        {financeData.paymentAmount > 0 ? (
                          financeData.frequency === 'weekly' 
                            ? `${Math.ceil(parseFloat(financeData.totalAmount) / parseFloat(financeData.paymentAmount))} weeks`
                            : `${Math.ceil(parseFloat(financeData.totalAmount) / parseFloat(financeData.paymentAmount))} months`
                        ) : '0 months'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={financeData.notes}
                  onChange={(e) => setFinanceData({...financeData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowCreateFinanceModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={submitFinanceAgreement}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Create Finance Agreement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <FiTrash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">Delete Selected Sales</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete {selectedSales.size} selected sale{selectedSales.size !== 1 ? 's' : ''}?
                  This action cannot be undone.
                </p>
              </div>
              <div className="items-center px-4 py-3 flex justify-center space-x-4">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales Communication Modal */}
      <SalesCommunicationModal
        isOpen={showCommunicationModal}
        onClose={() => setShowCommunicationModal(false)}
        selectedSales={Array.from(selectedSales).map(id => sales.find(sale => sale.id === id)).filter(Boolean)}
        onSuccess={() => {
          // Refresh data if needed
          fetchSales();
          fetchStats();
        }}
      />
    </div>
    </div>
  );
};

export default Sales; 