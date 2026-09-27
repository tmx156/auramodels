import React, { useState, useEffect } from 'react';
import { 
  FiPlus, FiEdit, FiEye, FiDollarSign, FiCalendar, FiMail, FiPhone, 
  FiTrendingUp, FiAlertCircle, FiCheckCircle, FiClock, FiX, FiBell, 
  FiCreditCard, FiSend, FiMessageSquare, FiChevronDown, FiChevronUp,
  FiMoreVertical, FiRefreshCw, FiDownload
} from 'react-icons/fi';
import { SiStripe } from 'react-icons/si';
import axios from 'axios';

const FinanceEnhanced = () => {
  // State
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [paymentSchedule, setPaymentSchedule] = useState([]);
  const [stats, setStats] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [showNotifications, setShowNotifications] = useState(false);
  const [reminderModal, setReminderModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [leads, setLeads] = useState([]);
  const [formData, setFormData] = useState({
    leadId: '',
    totalAmount: '',
    depositAmount: '0',
    monthlyPayment: '',
    frequency: 'monthly',
    duration: 12,
    startDate: '',
    dueDay: 1,
    emailReminders: true,
    smsReminders: false,
    notes: ''
  });

  // Load data
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    await Promise.all([
      fetchAgreements(),
      fetchStats(),
      fetchNotifications(),
      fetchLeads()
    ]);
    setLoading(false);
  };

  const fetchAgreements = async () => {
    try {
      const response = await axios.get('/api/finance/agreements');
      setAgreements(response.data || []);
    } catch (error) {
      console.error('Error fetching agreements:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/finance/dashboard-stats');
      setStats(response.data?.stats || {});
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await axios.get('/api/finance/admin-notifications');
      setNotifications(response.data?.notifications || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await axios.get('/api/leads');
      setLeads(response.data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
    }
  };

  const fetchPaymentSchedule = async (agreementId) => {
    try {
      const response = await axios.get(`/api/finance/agreement/${agreementId}/schedule`);
      setPaymentSchedule(response.data?.schedule || []);
    } catch (error) {
      console.error('Error fetching schedule:', error);
    }
  };

  // Handlers
  const handleViewDetails = async (agreement) => {
    setSelectedAgreement(agreement);
    await fetchPaymentSchedule(agreement.id);
    setShowDetails(true);
  };

  const handleSendReminder = async () => {
    if (!selectedAgreement || !selectedPayment) return;
    
    setSendingReminder(true);
    try {
      await axios.post(`/api/finance/agreement/${selectedAgreement.id}/send-reminder`, {
        type: 'email',
        message: reminderMessage
      });
      
      setReminderModal(false);
      setReminderMessage('');
      alert('Reminder sent successfully');
    } catch (error) {
      console.error('Error sending reminder:', error);
      alert('Failed to send reminder');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleCreateStripeLink = async (payment) => {
    try {
      const response = await axios.post('/api/finance/create-stripe-link', {
        financeId: selectedAgreement.id,
        paymentScheduleId: payment.id,
        amount: payment.amount,
        description: `Payment ${payment.payment_number} of ${selectedAgreement.duration}`
      });

      if (response.data?.paymentLink) {
        // Copy to clipboard or open in new window
        window.open(response.data.paymentLink, '_blank');
      }
    } catch (error) {
      console.error('Error creating Stripe link:', error);
      alert('Failed to create payment link');
    }
  };

  const handleRecordPayment = async (payment) => {
    setRecordingPayment(true);
    try {
      await axios.post('/api/finance/record-payment', {
        financeId: selectedAgreement.id,
        paymentScheduleId: payment.id,
        amount: paymentAmount || payment.amount,
        paymentMethod: 'manual'
      });

      await fetchPaymentSchedule(selectedAgreement.id);
      await fetchStats();
      setPaymentAmount('');
      alert('Payment recorded successfully');
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleMarkNotificationRead = async (notificationId) => {
    try {
      await axios.post(`/api/finance/admin-notifications/${notificationId}/read`);
      await fetchNotifications();
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        ...formData,
        totalAmount: parseFloat(formData.totalAmount),
        depositAmount: parseFloat(formData.depositAmount) || 0,
        paymentAmount: parseFloat(formData.monthlyPayment) || 
          ((parseFloat(formData.totalAmount) - (parseFloat(formData.depositAmount) || 0)) / formData.duration),
        startDate: formData.startDate,
        dueDay: parseInt(formData.dueDay) || 1
      };

      await axios.post('/api/finance/agreement', submitData);
      
      setShowModal(false);
      fetchAgreements();
      fetchStats();
    } catch (error) {
      console.error('Error creating agreement:', error);
      alert('Failed to create agreement');
    }
  };

  // Formatters
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', { 
      style: 'currency', 
      currency: 'GBP' 
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'completed': return 'text-blue-600 bg-blue-100';
      case 'defaulted': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'overdue': return 'text-red-600 bg-red-100';
      case 'paid': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">💰 Finance Management Pro</h1>
              <p className="text-gray-600 mt-2">Track payments, send reminders, manage agreements</p>
            </div>
            <div className="flex items-center space-x-3">
              {/* Notifications Bell */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 bg-gray-100 rounded-full hover:bg-gray-200"
                >
                  <FiBell className="w-6 h-6 text-gray-600" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </button>
                
                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl z-50 border">
                    <div className="p-4 border-b">
                      <h3 className="font-semibold">Admin Notifications</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="p-4 text-gray-500 text-center">No new notifications</p>
                      ) : (
                        notifications.map(notif => (
                          <div key={notif.id} className="p-4 border-b hover:bg-gray-50">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className={`text-sm font-medium ${
                                  notif.notification_type === 'payment_overdue' ? 'text-red-600' : 'text-amber-600'
                                }`}>
                                  {notif.notification_type === 'payment_overdue' ? '⚠️ Overdue' : '⏰ Due Soon'}
                                </p>
                                <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(notif.created_at).toLocaleDateString('en-GB')}
                                </p>
                              </div>
                              <button
                                onClick={() => handleMarkNotificationRead(notif.id)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Mark read
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
              >
                <FiPlus /> New Agreement
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-blue-200 p-6">
            <div className="flex items-center">
              <div className="p-4 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl shadow-lg">
                <FiDollarSign className="h-8 w-8 text-white" />
              </div>
              <div className="ml-6">
                <p className="text-sm font-semibold text-gray-600 uppercase">Total Financed</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats?.dueThisMonth)}</p>
                <p className="text-xs text-blue-600 font-medium mt-1">Due this month</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-green-200 p-6">
            <div className="flex items-center">
              <div className="p-4 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl shadow-lg">
                <FiCheckCircle className="h-8 w-8 text-white" />
              </div>
              <div className="ml-6">
                <p className="text-sm font-semibold text-gray-600 uppercase">Collected</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats?.collectedThisMonth)}</p>
                <p className="text-xs text-green-600 font-medium mt-1">This month</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-6">
            <div className="flex items-center">
              <div className="p-4 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl shadow-lg">
                <FiAlertCircle className="h-8 w-8 text-white" />
              </div>
              <div className="ml-6">
                <p className="text-sm font-semibold text-gray-600 uppercase">Overdue</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.overdueCount || 0}</p>
                <p className="text-xs text-red-600 font-medium mt-1">{formatCurrency(stats?.overdueAmount)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-orange-200 p-6">
            <div className="flex items-center">
              <div className="p-4 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl shadow-lg">
                <FiClock className="h-8 w-8 text-white" />
              </div>
              <div className="ml-6">
                <p className="text-sm font-semibold text-gray-600 uppercase">Upcoming</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.upcomingPayments?.length || 0}</p>
                <p className="text-xs text-orange-600 font-medium mt-1">Due in 5 days</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b">
            <div className="flex">
              {['overview', 'upcoming', 'overdue', 'all'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Overview - Show recent/upcoming */}
            {activeTab === 'overview' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Upcoming Payments (Next 5 Days)</h3>
                {stats?.upcomingPayments?.length === 0 ? (
                  <p className="text-gray-500">No upcoming payments</p>
                ) : (
                  <div className="space-y-3">
                    {stats?.upcomingPayments?.slice(0, 5).map(payment => (
                      <div key={payment.id} className="flex items-center justify-between bg-amber-50 p-4 rounded-lg border border-amber-200">
                        <div>
                          <p className="font-medium">{payment.finance?.lead?.name}</p>
                          <p className="text-sm text-gray-600">Due: {formatDate(payment.due_date)}</p>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-xl font-bold text-amber-700">{formatCurrency(payment.amount)}</span>
                          <button
                            onClick={() => {
                              setSelectedAgreement(payment.finance);
                              setSelectedPayment(payment);
                              setReminderModal(true);
                            }}
                            className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                            title="Send Reminder"
                          >
                            <FiSend className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* All Agreements Table */}
            {(activeTab === 'all' || activeTab === 'overdue') && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agreement</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Payment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {agreements
                      .filter(a => activeTab === 'all' || (activeTab === 'overdue' && a.status === 'defaulted'))
                      .map((agreement) => (
                      <tr key={agreement.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{agreement?.agreement_number}</div>
                          <div className="text-sm text-gray-500 capitalize">{agreement?.payment_frequency}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{agreement?.lead_name}</div>
                          <div className="text-sm text-gray-500">{agreement?.lead_email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{formatCurrency(agreement?.total_amount)}</div>
                          <div className="text-sm text-gray-500">
                            {formatCurrency(agreement?.remaining_balance)} remaining
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {agreement?.next_payment_date ? formatDate(agreement.next_payment_date) : 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(agreement?.status)}`}>
                            {agreement?.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleViewDetails(agreement)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agreement Details Modal */}
      {showDetails && selectedAgreement && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-3/4 max-w-5xl shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Agreement Details - {selectedAgreement.agreement_number}</h3>
              <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600">
                <FiX className="h-6 w-6" />
              </button>
            </div>

            {/* Agreement Info */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Customer</p>
                <p className="font-semibold">{selectedAgreement.lead_name}</p>
                <p className="text-sm text-gray-500">{selectedAgreement.lead_email}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="font-semibold text-xl">{formatCurrency(selectedAgreement.total_amount)}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Remaining</p>
                <p className="font-semibold text-xl">{formatCurrency(selectedAgreement.remaining_balance)}</p>
              </div>
            </div>

            {/* Payment Schedule */}
            <h4 className="font-semibold mb-3">Payment Schedule</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Due Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentSchedule.map((payment) => (
                    <tr key={payment.id} className="border-b">
                      <td className="px-4 py-2">{payment.payment_number}</td>
                      <td className="px-4 py-2">{formatDate(payment.due_date)}</td>
                      <td className="px-4 py-2 font-medium">{formatCurrency(payment.amount)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {payment.status === 'pending' && (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedPayment(payment);
                                setReminderModal(true);
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="Send Reminder"
                            >
                              <FiMail className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCreateStripeLink(payment)}
                              className="p-1 text-purple-600 hover:bg-purple-100 rounded"
                              title="Create Stripe Payment Link"
                            >
                              <SiStripe className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRecordPayment(payment)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="Record Payment"
                            >
                              <FiDollarSign className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {reminderModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Send Payment Reminder</h3>
            <p className="text-sm text-gray-600 mb-4">
              Payment #{selectedPayment?.payment_number} - {formatCurrency(selectedPayment?.amount)}
            </p>
            <textarea
              value={reminderMessage}
              onChange={(e) => setReminderMessage(e.target.value)}
              placeholder="Optional custom message..."
              className="w-full p-2 border rounded-lg mb-4"
              rows={3}
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setReminderModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReminder}
                disabled={sendingReminder}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {sendingReminder ? 'Sending...' : 'Send Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Agreement Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium mb-4">New Finance Agreement</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Lead</label>
                <select
                  value={formData.leadId}
                  onChange={(e) => setFormData({...formData, leadId: e.target.value})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select a lead</option>
                  {leads.map(lead => (
                    <option key={lead.id} value={lead.id}>{lead.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Total Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({...formData, totalAmount: e.target.value})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Deposit Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.depositAmount}
                  onChange={(e) => setFormData({...formData, depositAmount: e.target.value})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Monthly Payment</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.monthlyPayment}
                  onChange={(e) => setFormData({...formData, monthlyPayment: e.target.value})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  placeholder="Auto-calculated if empty"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Frequency</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({...formData, frequency: e.target.value})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Duration (payments)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.duration}
                  onChange={(e) => setFormData({...formData, duration: parseInt(e.target.value) || 12})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  required
                />
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.emailReminders}
                    onChange={(e) => setFormData({...formData, emailReminders: e.target.checked})}
                    className="rounded border-gray-300"
                  />
                  <span className="ml-2 text-sm">Email Reminders</span>
                </label>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 rounded-md"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceEnhanced;
