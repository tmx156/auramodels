import React, { useState, useEffect, useCallback } from 'react';
import { 
  FiDownload, FiCalendar, FiUser, FiTrendingUp, FiDollarSign, 
  FiRefreshCw, FiTarget, FiAward, FiCheck, FiPhone, 
  FiXCircle, FiUserX, FiPieChart, FiBarChart2, FiActivity
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import LeadAnalysis from './LeadAnalysis';

// Colors for charts
const COLORS = {
  assigned: '#3B82F6',
  booked: '#10B981',
  arrived: '#8B5CF6',
  left: '#6366F1',
  noSale: '#F97316',
  complete: '#EC4899',
  review: '#14B8A6',
  noShow: '#EF4444',
  cancelled: '#6B7280',
  noAnswer: '#F59E0B',
  noAnswerX2: '#D97706',
  noAnswerX3: '#92400E',
  sales: '#FBBF24'
};

const Reports = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  // Tab state
  const [activeTab, setActiveTab] = useState('performance');

  // State
  const [stats, setStats] = useState({
    // Core metrics
    assigned: 0,
    booked: 0,
    attended: 0,
    sales: 0,
    revenue: 0,
    
    // Attendance breakdown
    arrived: 0,
    left: 0,
    noSale: 0,
    complete: 0,
    
    // Other statuses
    noShows: 0,
    cancelled: 0,
    
    // No answer breakdown
    noAnswer: 0,
    noAnswerX2: 0,
    noAnswerX3: 0,
    
    // Calculated rates
    bookingRate: 0,
    showUpRate: 0,
    salesConversion: 0
  });

  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(() => {
    // Default to last week (Feb 2-8, 2026)
    return {
      startDate: '2026-02-02',
      endDate: '2026-02-08',
      userId: user?.role === 'admin' ? 'all' : user?.id || ''
    };
  });
  const [users, setUsers] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers([
        { id: 'all', name: 'All Users' },
        ...response.data.filter(u => u.role === 'booker' || u.role === 'admin')
      ]);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([{ id: 'all', name: 'All Users' }]);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const startUTC = new Date(filters.startDate + 'T00:00:00.000Z').toISOString();
      const endUTC = new Date(filters.endDate + 'T23:59:59.999Z').toISOString();

      console.log('📊 Fetching stats:', { startUTC, endUTC, userId: filters.userId });

      // Use the SAME stats API as LeadsNew - handles pagination internally, bypasses 1000 limit
      const params = { date_start: startUTC, date_end: endUTC };
      if (filters.userId !== 'all') {
        params.booker = filters.userId;
      }

      // Fetch lead stats and sales revenue in parallel
      // Sales API uses relational join: sales → leads (by date_booked + attended status)
      const [leadsResponse, salesResponse] = await Promise.all([
        axios.get('/api/stats/leads', { params }),
        axios.get('/api/sales/stats', {
          params: {
            dateRange: 'custom',
            startDate: startUTC,
            endDate: endUTC,
            ...(filters.userId !== 'all' ? { booker: filters.userId } : {})
          }
        }).catch(() => ({ data: {} })) // Graceful fallback if sales API fails
      ]);

      const counts = leadsResponse.data;
      const salesStats = salesResponse.data;

      console.log('📊 Stats API response:', counts);
      console.log('💰 Sales API response:', salesStats);

      // Map stats API response to Reports state
      const assigned = counts.assigned || 0;
      const booked = counts.booked || 0;
      const attended = counts.attendedFilter || 0;
      // Use sales count from sales API (filtered by sale creation date)
      // This ensures sales count matches the revenue figure
      const sales = salesStats.totalSales || 0;
      // Revenue from sales API (filtered by sale creation date)
      const revenue = salesStats.totalRevenue || 0;

      // Attendance sub-breakdown
      const arrived = counts.arrived || 0;
      const left = counts.leftBuilding || 0;
      const noSale = counts.noSale || 0;
      const complete = counts.complete || 0;
      const review = counts.review || 0;

      // Other statuses
      const noShows = counts.noShow || 0;
      const cancelled = counts.cancelledFilter || 0;

      // No answer breakdown
      const noAnswer = counts.noAnswerCall || 0;
      const noAnswerX2 = counts.noAnswerX2 || 0;
      const noAnswerX3 = counts.noAnswerX3 || 0;

      // Calculate rates
      const bookingRate = assigned > 0 ? Math.round((booked / assigned) * 100) : 0;
      const expectedAppointments = counts.expectedAppointments || 0;
      const showUpRate = expectedAppointments > 0 ? Math.round((attended / expectedAppointments) * 100) : 0;
      const salesConversion = attended > 0 ? Math.round((sales / attended) * 100) : 0;

      const calculated = {
        assigned, booked, attended, sales, revenue,
        arrived, left, noSale, complete, review,
        noShows, cancelled,
        noAnswer, noAnswerX2, noAnswerX3,
        bookingRate, showUpRate, salesConversion
      };

      setStats(calculated);
      setLastUpdate(new Date());

      console.log('📊 Calculated stats:', calculated);

    } catch (error) {
      console.error('Error fetching stats:', error);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    }
    fetchStats();
  }, [user, fetchUsers, fetchStats]);

  useEffect(() => {
    if (socket) {
      const handleUpdate = () => {
        fetchStats();
        setLastUpdate(new Date());
      };
      socket.on('lead_updated', handleUpdate);
      socket.on('stats_update_needed', handleUpdate);
      return () => {
        socket.off('lead_updated', handleUpdate);
        socket.off('stats_update_needed', handleUpdate);
      };
    }
  }, [socket, fetchStats]);

  // Chart data preparation
  const attendanceData = [
    { name: 'Arrived', value: stats.arrived, color: COLORS.arrived },
    { name: 'Left', value: stats.left, color: COLORS.left },
    { name: 'No Sale', value: stats.noSale, color: COLORS.noSale },
    { name: 'Complete', value: stats.complete, color: COLORS.complete },
    { name: 'Review', value: stats.review, color: COLORS.review },
    { name: 'No Show', value: stats.noShows, color: COLORS.noShow },
  ].filter(d => d.value > 0);

  const noAnswerData = [
    { name: 'No Answer', value: stats.noAnswer, color: COLORS.noAnswer },
    { name: 'No Answer x2', value: stats.noAnswerX2, color: COLORS.noAnswerX2 },
    { name: 'No Answer x3', value: stats.noAnswerX3, color: COLORS.noAnswerX3 },
  ].filter(d => d.value > 0);

  const outcomeData = [
    { name: 'Booked', value: stats.booked, color: COLORS.booked },
    { name: 'No Answer (all)', value: stats.noAnswer + stats.noAnswerX2 + stats.noAnswerX3, color: COLORS.noAnswer },
    { name: 'Not Interested', value: stats.assigned > 0 ? Math.round(stats.assigned * 0.3) : 0, color: COLORS.cancelled },
  ].filter(d => d.value > 0);

  // Alex A.I report: "Assigned" means "Sent to Alex". Other bookers stay "Assigned".
  const ALEX_AI_USER_ID = '00000000-0000-0000-0000-000000000001';
  const isAlexSelected = filters.userId === ALEX_AI_USER_ID;
  const assignedLabel = isAlexSelected ? 'Sent to Alex' : 'Assigned';

  const conversionData = [
    { name: assignedLabel, value: stats.assigned, fill: COLORS.assigned },
    { name: 'Booked', value: stats.booked, fill: COLORS.booked },
    { name: 'Attended', value: stats.attended, fill: COLORS.arrived },
    { name: 'Sales', value: stats.sales, fill: COLORS.sales },
  ];

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  const exportReport = () => {
    const report = `
CRM Performance Report
Generated: ${new Date().toLocaleString()}
Period: ${filters.startDate} to ${filters.endDate}

SUMMARY:
- ${isAlexSelected ? 'Leads Sent to Alex' : 'Leads Assigned'}: ${stats.assigned}
- Total Booked: ${stats.booked}
- Attended: ${stats.attended}
- Sales: ${stats.sales}
- Revenue: ${formatCurrency(stats.revenue)}

ATTENDANCE BREAKDOWN:
- Arrived: ${stats.arrived}
- Left: ${stats.left}
- No Sale: ${stats.noSale}
- Complete: ${stats.complete}
- No Shows: ${stats.noShows}

NO ANSWER BREAKDOWN:
- No Answer: ${stats.noAnswer}
- No Answer x2: ${stats.noAnswerX2}
- No Answer x3: ${stats.noAnswerX3}

RATES:
- Booking Rate: ${stats.bookingRate}%
- Show Up Rate: ${stats.showUpRate}%
- Sales Conversion: ${stats.salesConversion}%
    `.trim();

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${filters.startDate}-to-${filters.endDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold">{payload[0].name}</p>
          <p className="text-lg">{payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Performance Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Booker performance analytics and conversion metrics
            {lastUpdate && (
              <span className="ml-2 text-green-600">
                • Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button onClick={exportReport} className="btn-primary flex items-center space-x-2">
          <FiDownload className="h-4 w-4" />
          <span>Export</span>
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex space-x-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('performance')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'performance'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FiBarChart2 className="inline h-4 w-4 mr-1.5" />
          Performance
        </button>
        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('lead-analysis')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'lead-analysis'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FiTarget className="inline h-4 w-4 mr-1.5" />
            Lead Analysis
          </button>
        )}
      </div>

      {activeTab === 'lead-analysis' && <LeadAnalysis />}

      {activeTab === 'performance' && (<>
      {/* Filters */}
      <div className="card bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FiCalendar className="inline h-4 w-4 mr-1" />
              Start Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FiCalendar className="inline h-4 w-4 mr-1" />
              End Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>
          {user?.role === 'admin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FiUser className="inline h-4 w-4 mr-1" />
                Booker
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={filters.userId}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={fetchStats}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center space-x-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <FiRefreshCw className="h-4 w-4" />
                  <span>Generate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">{assignedLabel}</p>
              <p className="text-3xl font-bold">{stats.assigned}</p>
            </div>
            <FiUser className="h-10 w-10 text-blue-200" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Booked</p>
              <p className="text-3xl font-bold">{stats.booked}</p>
            </div>
            <FiCalendar className="h-10 w-10 text-green-200" />
          </div>
          <p className="text-sm mt-2">{stats.bookingRate}% booking rate</p>
        </div>

        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Attended</p>
              <p className="text-3xl font-bold">{stats.attended}</p>
            </div>
            <FiCheck className="h-10 w-10 text-purple-200" />
          </div>
          <p className="text-sm mt-2">{stats.showUpRate}% show up rate</p>
        </div>

        <div className="card bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm">Sales</p>
              <p className="text-3xl font-bold">{stats.sales}</p>
            </div>
            <FiDollarSign className="h-10 w-10 text-yellow-200" />
          </div>
          <p className="text-sm mt-2" title="Revenue from sales in selected date range">
            {formatCurrency(stats.revenue)} revenue
          </p>
        </div>
      </div>

      {/* Conversion Funnel Bar Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FiTrendingUp className="h-5 w-5 mr-2 text-blue-600" />
          Conversion Funnel
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={conversionData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-center">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-900">{stats.bookingRate}%</p>
            <p className="text-sm text-blue-700">Booking Rate</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-900">{stats.showUpRate}%</p>
            <p className="text-sm text-purple-700">Show Up Rate</p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-900">{stats.salesConversion}%</p>
            <p className="text-sm text-yellow-700">Sales Conversion</p>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Attendance Breakdown Pie Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FiPieChart className="h-5 w-5 mr-2 text-purple-600" />
            Attendance Breakdown
          </h3>
          {attendanceData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendanceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attendanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No attendance data
            </div>
          )}
          {/* Legend Stats */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="flex items-center text-sm">
              <div className="w-3 h-3 rounded-full mr-2" style={{ background: COLORS.arrived }}></div>
              <span>Arrived: {stats.arrived}</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-3 h-3 rounded-full mr-2" style={{ background: COLORS.left }}></div>
              <span>Left: {stats.left}</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-3 h-3 rounded-full mr-2" style={{ background: COLORS.noSale }}></div>
              <span>No Sale: {stats.noSale}</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-3 h-3 rounded-full mr-2" style={{ background: COLORS.complete }}></div>
              <span>Complete: {stats.complete}</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-3 h-3 rounded-full mr-2" style={{ background: COLORS.noShow }}></div>
              <span>No Show: {stats.noShows}</span>
            </div>
          </div>
        </div>

        {/* No Answer Breakdown Pie Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FiPhone className="h-5 w-5 mr-2 text-amber-600" />
            No Answer Breakdown
          </h3>
          {noAnswerData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={noAnswerData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {noAnswerData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No no-answer data
            </div>
          )}
          {/* Total No Answer */}
          <div className="mt-4 p-4 bg-amber-50 rounded-lg text-center">
            <p className="text-3xl font-bold text-amber-900">
              {stats.noAnswer + stats.noAnswerX2 + stats.noAnswerX3}
            </p>
            <p className="text-sm text-amber-700">Total No Answer</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
            <div>
              <p className="font-bold text-amber-700">{stats.noAnswer}</p>
              <p className="text-gray-500">1st</p>
            </div>
            <div>
              <p className="font-bold text-amber-700">{stats.noAnswerX2}</p>
              <p className="text-gray-500">2nd</p>
            </div>
            <div>
              <p className="font-bold text-amber-700">{stats.noAnswerX3}</p>
              <p className="text-gray-500">3rd</p>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FiBarChart2 className="h-5 w-5 mr-2 text-green-600" />
            Key Metrics
          </h3>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{isAlexSelected ? 'Sent to Booked' : 'Assigned to Booked'}</span>
                <span className="text-2xl font-bold text-green-600">
                  {stats.assigned > 0 ? Math.round((stats.booked / stats.assigned) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-500 h-2 rounded-full" 
                  style={{ width: `${stats.assigned > 0 ? (stats.booked / stats.assigned) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Booked to Attended</span>
                <span className="text-2xl font-bold text-purple-600">
                  {stats.booked > 0 ? Math.round((stats.attended / stats.booked) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full" 
                  style={{ width: `${stats.booked > 0 ? (stats.attended / stats.booked) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Attended to Sales</span>
                <span className="text-2xl font-bold text-yellow-600">
                  {stats.attended > 0 ? Math.round((stats.sales / stats.attended) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-yellow-500 h-2 rounded-full" 
                  style={{ width: `${stats.attended > 0 ? (stats.sales / stats.attended) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg">
              <p className="text-sm text-gray-600">Revenue per Attended</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.attended > 0 ? formatCurrency(stats.revenue / stats.attended) : formatCurrency(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FiActivity className="h-5 w-5 mr-2 text-blue-600" />
          Detailed Statistics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-900">{stats.assigned}</p>
            <p className="text-xs text-blue-700">{assignedLabel}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-900">{stats.booked}</p>
            <p className="text-xs text-green-700">Booked</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-900">{stats.arrived}</p>
            <p className="text-xs text-purple-700">Arrived</p>
          </div>
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <p className="text-2xl font-bold text-indigo-900">{stats.left}</p>
            <p className="text-xs text-indigo-700">Left</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-900">{stats.noSale}</p>
            <p className="text-xs text-orange-700">No Sale</p>
          </div>
          <div className="text-center p-4 bg-pink-50 rounded-lg">
            <p className="text-2xl font-bold text-pink-900">{stats.complete}</p>
            <p className="text-xs text-pink-700">Complete</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-900">{stats.noShows}</p>
            <p className="text-xs text-red-700">No Shows</p>
          </div>
          <div className="text-center p-4 bg-gray-100 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{stats.cancelled}</p>
            <p className="text-xs text-gray-700">Cancelled</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-900">{stats.noAnswer}</p>
            <p className="text-xs text-amber-700">No Answer</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-900">{stats.noAnswerX2}</p>
            <p className="text-xs text-amber-700">No Answer x2</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-900">{stats.noAnswerX3}</p>
            <p className="text-xs text-amber-700">No Answer x3</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-900">{stats.sales}</p>
            <p className="text-xs text-yellow-700">Sales</p>
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
};

export default Reports;
