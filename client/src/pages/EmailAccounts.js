import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiEdit, FiTrash2, FiPlus, FiX, FiMail, FiKey, FiCheck, FiStar, FiRefreshCw, FiDownload, FiActivity, FiAlertTriangle, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const EmailAccounts = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Create account modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    client_id: '',
    client_secret: '',
    refresh_token: '',
    redirect_uri: '',
    display_name: 'Auralndn',
    is_default: false
  });
  const [formErrors, setFormErrors] = useState({});

  // State for edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAccountData, setEditAccountData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // State for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // State for testing
  const [testingAccountId, setTestingAccountId] = useState(null);

  // State for connection status per account (tracks last test result)
  const [connectionStatus, setConnectionStatus] = useState({});

  // State for importing from env
  const [importing, setImporting] = useState(false);

  // State for Gmail health check
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);

  // State for SMS health check
  const [smsHealth, setSmsHealth] = useState(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState(null);

  // Account currently being re-authorised, plus the last outcome banner
  const [reauthingId, setReauthingId] = useState(null);
  const [reauthNotice, setReauthNotice] = useState(null);
  // Interval watching the OAuth popup, cleared on unmount.
  const popupWatcher = useRef(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAccounts();
      fetchHealthCheck();
      fetchSmsHealth();
    }
  }, [user]);

  // The OAuth popup reports back here when authorisation finishes.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== 'gmail-reauth') return;

      setReauthingId(null);
      setReauthNotice({ ok: event.data.ok, message: event.data.message });

      if (event.data.ok) {
        fetchAccounts();
        fetchHealthCheck();
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
      // Stop the popup watcher too, or it keeps polling and calling setState
      // after the page has been navigated away from.
      if (popupWatcher.current) {
        clearInterval(popupWatcher.current);
        popupWatcher.current = null;
      }
    };
  }, []);

  const fetchHealthCheck = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const response = await axios.get('/api/email-accounts/health');
      setHealthData(response.data);
    } catch (error) {
      console.error('Error fetching Gmail health:', error);
      setHealthError(error.response?.data?.message || 'Failed to check Gmail health');
    }
    setHealthLoading(false);
  };

  const fetchSmsHealth = async () => {
    setSmsLoading(true);
    setSmsError(null);
    try {
      const response = await axios.get('/api/email-accounts/sms-health');
      setSmsHealth(response.data);
    } catch (error) {
      console.error('Error fetching SMS health:', error);
      setSmsError(error.response?.data?.message || 'Failed to check SMS health');
    }
    setSmsLoading(false);
  };

  /**
   * Re-authorise one account. Opens Google in a popup so the CRM page stays
   * put, and the popup posts its result back to the listener above.
   */
  const handleReauthorize = async (account) => {
    const identifier = account.id || account.accountKey || account.email;
    setReauthNotice(null);
    setReauthingId(identifier);

    // Open the window synchronously: browsers block popups opened later,
    // after the await resolves.
    const popup = window.open('', 'gmail-reauth', 'width=520,height=680');

    try {
      const response = await axios.get(`/api/email-accounts/${encodeURIComponent(identifier)}/reauth-url`);
      const { authUrl } = response.data;

      if (!authUrl) throw new Error('No authorisation URL returned');

      if (popup && !popup.closed) {
        popup.location.href = authUrl;

        // The popup reports back via postMessage, but that only crosses when
        // the API and the app share an origin - in local dev they do not
        // (app on :3000, API on :5000). Watching for the window to close is
        // the reliable signal, so re-check health either way.
        if (popupWatcher.current) clearInterval(popupWatcher.current);
        popupWatcher.current = setInterval(() => {
          if (!popup.closed) return;
          clearInterval(popupWatcher.current);
          popupWatcher.current = null;
          setReauthingId((current) => (current === identifier ? null : current));
          fetchAccounts();
          fetchHealthCheck();
        }, 700);
      } else {
        // Popup blocked - fall back to a full-page redirect.
        window.location.href = authUrl;
      }
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      setReauthingId(null);
      setReauthNotice({
        ok: false,
        message: error.response?.data?.message || error.message || 'Could not start authorisation'
      });
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await axios.get('/api/email-accounts');
      setAccounts(response.data);
    } catch (error) {
      console.error('Error fetching email accounts:', error);
    }
    setLoading(false);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }

    return errors;
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setCreateLoading(true);
    setFormErrors({});

    try {
      const response = await axios.post('/api/email-accounts', formData);

      setAccounts(prev => [response.data.account, ...prev]);

      setFormData({
        name: '',
        email: '',
        client_id: '',
        client_secret: '',
        refresh_token: '',
        redirect_uri: '',
        display_name: 'Auralndn',
        is_default: false
      });
      setShowCreateModal(false);

      alert('Email account created successfully!');

    } catch (error) {
      console.error('Error creating email account:', error);
      const errorMessage = error.response?.data?.message || 'Failed to create email account';
      setFormErrors({ submit: errorMessage });
    }

    setCreateLoading(false);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setFormData({
      name: '',
      email: '',
      client_id: '',
      client_secret: '',
      refresh_token: '',
      redirect_uri: '',
      display_name: 'Auralndn',
      is_default: false
    });
    setFormErrors({});
  };

  const handleEditAccount = async (e) => {
    e.preventDefault();

    setEditLoading(true);

    try {
      const response = await axios.put(`/api/email-accounts/${editAccountData.id}`, editAccountData);

      // Refresh the accounts list to get updated data
      await fetchAccounts();

      setShowEditModal(false);
      setEditAccountData(null);

      alert('Email account updated successfully!');
    } catch (error) {
      console.error('Error updating email account:', error);
      alert(error.response?.data?.message || 'Failed to update email account');
    }

    setEditLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountId) return;

    setDeleteLoading(true);

    try {
      await axios.delete(`/api/email-accounts/${deleteAccountId}`);

      setAccounts(prev => prev.filter(account => account.id !== deleteAccountId));

      setShowDeleteConfirm(false);
      setDeleteAccountId(null);

      alert('Email account deleted successfully!');
    } catch (error) {
      console.error('Error deleting email account:', error);
      alert(error.response?.data?.message || 'Failed to delete email account');
    }

    setDeleteLoading(false);
  };

  const handleTestConnection = async (accountId) => {
    setTestingAccountId(accountId);

    try {
      const response = await axios.post(`/api/email-accounts/${accountId}/test`);

      if (response.data.success) {
        // Update connection status to success
        setConnectionStatus(prev => ({
          ...prev,
          [accountId]: { success: true, testedAt: new Date().toISOString() }
        }));
        alert(`Connection successful!\nEmail: ${response.data.email}\nMessages: ${response.data.messagesTotal}`);
      } else {
        // Update connection status to failed
        setConnectionStatus(prev => ({
          ...prev,
          [accountId]: {
            success: false,
            error: response.data.error,
            needsReauth: response.data.needsReauth,
            testedAt: new Date().toISOString()
          }
        }));
        alert(`Connection failed: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Error testing email account:', error);
      // Update connection status to failed
      setConnectionStatus(prev => ({
        ...prev,
        [accountId]: {
          success: false,
          error: error.response?.data?.error || 'Failed to test connection',
          testedAt: new Date().toISOString()
        }
      }));
      alert(error.response?.data?.error || 'Failed to test connection');
    }

    setTestingAccountId(null);
  };

  const handleSetDefault = async (accountId) => {
    try {
      await axios.post(`/api/email-accounts/${accountId}/set-default`);

      // Refresh accounts to show updated default status
      await fetchAccounts();

      alert('Default email account updated!');
    } catch (error) {
      console.error('Error setting default account:', error);
      alert(error.response?.data?.message || 'Failed to set default account');
    }
  };

  const openEditModal = (accountData) => {
    setEditAccountData({
      id: accountData.id,
      name: accountData.name,
      email: accountData.email,
      client_id: '', // Don't populate - only update if new value provided
      client_secret: '',
      refresh_token: '',
      redirect_uri: accountData.redirect_uri || '',
      display_name: accountData.display_name || 'Auralndn',
      is_active: accountData.is_active,
      is_default: accountData.is_default
    });
    setShowEditModal(true);
  };

  const openDeleteConfirm = (accountId) => {
    setDeleteAccountId(accountId);
    setShowDeleteConfirm(true);
  };

  // State for import preview modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleShowImportModal = async () => {
    setLoadingPreview(true);
    setShowImportModal(true);

    try {
      const response = await axios.get('/api/email-accounts/preview-env');
      setImportPreview(response.data);
    } catch (error) {
      console.error('Error loading preview:', error);
      setImportPreview({ error: error.response?.data?.message || 'Failed to load preview' });
    }

    setLoadingPreview(false);
  };

  const handleImportFromEnv = async () => {
    setImporting(true);

    try {
      const response = await axios.post('/api/email-accounts/import-from-env');

      let message = response.data.message;

      if (response.data.imported?.length > 0) {
        message += '\n\nImported:\n' + response.data.imported.map(a => `- ${a.email}`).join('\n');
      }

      if (response.data.skipped?.length > 0) {
        message += '\n\nSkipped (already exist):\n' + response.data.skipped.map(a => `- ${a.email}`).join('\n');
      }

      if (response.data.errors?.length > 0) {
        message += '\n\nErrors:\n' + response.data.errors.map(a => `- ${a.email}: ${a.error}`).join('\n');
      }

      alert(message);
      setShowImportModal(false);

      // Refresh the accounts list
      await fetchAccounts();
    } catch (error) {
      console.error('Error importing from env:', error);
      alert(error.response?.data?.message || 'Failed to import accounts');
    }

    setImporting(false);
  };

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Email Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage email accounts for sending messages</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleShowImportModal}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors flex items-center space-x-2"
            title="Import accounts from server environment variables"
          >
            <FiDownload className="h-4 w-4" />
            <span>Import from Env</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <FiPlus className="h-4 w-4" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Email account health */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <FiActivity className="h-5 w-5 text-gray-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Email account health</h2>
              {healthData?.checkedAt && (
                <p className="text-xs text-gray-500">
                  Checked {new Date(healthData.checkedAt).toLocaleTimeString()} &middot; live check against Google
                </p>
              )}
            </div>
          </div>
          <button
            onClick={fetchHealthCheck}
            disabled={healthLoading}
            className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors flex items-center space-x-1 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
            <span>{healthLoading ? 'Checking...' : 'Re-check'}</span>
          </button>
        </div>

        {reauthNotice && (
          <div
            className={`text-sm p-3 rounded-md mb-3 flex items-start justify-between gap-3 ${
              reauthNotice.ok ? 'text-green-800 bg-green-50' : 'text-red-800 bg-red-50'
            }`}
          >
            <span>{reauthNotice.message}</span>
            <button onClick={() => setReauthNotice(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        )}

        {healthError && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-3">{healthError}</div>
        )}

        {healthLoading && !healthData && (
          <div className="text-sm text-gray-500 text-center py-6">Checking every account against Google...</div>
        )}

        {healthData && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
              <span className="flex items-center space-x-1 text-green-600">
                <FiCheckCircle className="h-4 w-4" />
                <span>{healthData.summary.healthy} working</span>
              </span>
              {healthData.summary.needsReauth > 0 && (
                <span className="flex items-center space-x-1 text-red-600 font-semibold">
                  <FiXCircle className="h-4 w-4" />
                  <span>{healthData.summary.needsReauth} need re-authorising</span>
                </span>
              )}
              {healthData.summary.notConfigured > 0 && (
                <span className="flex items-center space-x-1 text-yellow-600">
                  <FiAlertTriangle className="h-4 w-4" />
                  <span>{healthData.summary.notConfigured} incomplete</span>
                </span>
              )}
              {healthData.summary.errored > 0 && (
                <span className="flex items-center space-x-1 text-orange-600">
                  <FiAlertTriangle className="h-4 w-4" />
                  <span>{healthData.summary.errored} errored</span>
                </span>
              )}
              <span className="text-gray-400">{healthData.summary.total} total</span>
            </div>

            <div className="space-y-2">
              {healthData.accounts.map((account) => {
                const identifier = account.id || account.accountKey || account.email;
                const isHealthy = account.status === 'healthy';
                const isBusy = reauthingId === identifier;

                const tone = isHealthy
                  ? 'border-green-200 bg-green-50'
                  : account.status === 'needs_reauth'
                  ? 'border-red-200 bg-red-50'
                  : 'border-yellow-200 bg-yellow-50';

                return (
                  <div key={identifier} className={`p-3 rounded-lg border ${tone}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isHealthy ? (
                            <FiCheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : account.status === 'needs_reauth' ? (
                            <FiXCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          ) : (
                            <FiAlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate">{account.email}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {account.source === 'database' ? 'stored' : 'env var'}
                          </span>
                        </div>

                        {isHealthy ? (
                          <div className="text-xs text-gray-600 mt-1 ml-6">
                            Connected
                            {typeof account.messagesTotal === 'number' &&
                              ` · ${account.messagesTotal.toLocaleString()} messages`}
                            {typeof account.latencyMs === 'number' && ` · ${account.latencyMs}ms`}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-700 mt-1 ml-6">
                            <span className="font-medium">{account.error}</span>
                            {account.detail && <span className="block text-gray-500 mt-0.5">{account.detail}</span>}
                          </div>
                        )}

                        {account.mailboxMismatch && (
                          <div className="text-xs text-orange-700 mt-1 ml-6">
                            Warning: this token authenticates as {account.mailbox}, not {account.email}.
                          </div>
                        )}
                      </div>

                      {account.canReauth && (
                        <button
                          onClick={() => handleReauthorize(account)}
                          disabled={isBusy}
                          className={`flex-shrink-0 px-3 py-1.5 text-sm rounded-md flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-60 ${
                            isHealthy
                              ? 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              : 'text-white bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          <FiKey className="h-3.5 w-3.5" />
                          <span>{isBusy ? 'Waiting for Google...' : isHealthy ? 'Re-authorise' : 'Fix now'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* SMS health */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <FiActivity className="h-5 w-5 text-gray-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">SMS health</h2>
              {smsHealth?.checkedAt && (
                <p className="text-xs text-gray-500">
                  Checked {new Date(smsHealth.checkedAt).toLocaleTimeString()} &middot;{' '}
                  {smsHealth.provider} &middot; sender {smsHealth.senderId}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={fetchSmsHealth}
            disabled={smsLoading}
            className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors flex items-center space-x-1 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${smsLoading ? 'animate-spin' : ''}`} />
            <span>{smsLoading ? 'Checking...' : 'Re-check'}</span>
          </button>
        </div>

        {smsError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-3">{smsError}</div>}

        {smsLoading && !smsHealth && (
          <div className="text-sm text-gray-500 text-center py-6">Checking the SMS provider...</div>
        )}

        {smsHealth && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
              <div className="flex items-center space-x-2">
                {smsHealth.status === 'healthy' ? (
                  <FiCheckCircle className="h-5 w-5 text-green-500" />
                ) : smsHealth.status === 'degraded' ? (
                  <FiAlertTriangle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <FiXCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  {smsHealth.status === 'healthy'
                    ? 'Sending works'
                    : smsHealth.status === 'degraded'
                    ? 'Working, with problems'
                    : smsHealth.status === 'auth_failed'
                    ? 'Credentials rejected'
                    : smsHealth.status === 'not_configured'
                    ? 'Not configured'
                    : 'Provider unreachable'}
                </span>
              </div>

              <div className="text-sm">
                <span className="text-gray-500">Credit balance: </span>
                <span
                  className={`font-medium ${
                    smsHealth.balance === null
                      ? 'text-gray-400'
                      : Number(smsHealth.balance) <= 0
                      ? 'text-red-600'
                      : Number(smsHealth.balance) < 50
                      ? 'text-yellow-600'
                      : 'text-gray-900'
                  }`}
                >
                  {smsHealth.balance === null ? 'unavailable' : Number(smsHealth.balance).toLocaleString()}
                </span>
              </div>

              {smsHealth.delivery && !smsHealth.delivery.unavailable && (
                <div className="text-sm">
                  <span className="text-gray-500">Last 24h: </span>
                  <span className="font-medium text-gray-900">{smsHealth.delivery.sent} sent</span>
                  {smsHealth.delivery.failed > 0 && (
                    <span className="font-medium text-red-600">
                      {' '}&middot; {smsHealth.delivery.failed} failed
                      {smsHealth.delivery.sampled ? ` of ${smsHealth.delivery.sampled} checked` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {smsHealth.issues && smsHealth.issues.length > 0 ? (
              <div className="space-y-2">
                {smsHealth.issues.map((issue, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      issue.severity === 'critical'
                        ? 'border-red-200 bg-red-50'
                        : issue.severity === 'warning'
                        ? 'border-yellow-200 bg-yellow-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {issue.severity === 'critical' ? (
                        <FiXCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      ) : issue.severity === 'warning' ? (
                        <FiAlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <FiActivity className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{issue.title}</div>
                        <div className="text-xs text-gray-600 mt-0.5">{issue.detail}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
                No issues detected.
              </div>
            )}

            {smsHealth.delivery?.topErrors?.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Most common send errors (last 24h)
                </div>
                <div className="space-y-1">
                  {smsHealth.delivery.topErrors.map((err, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 text-xs text-gray-700">
                      <span className="font-mono break-all">{err.message}</span>
                      <span className="flex-shrink-0 text-gray-500">{err.count}&times;</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search accounts..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Email Accounts Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credentials
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAccounts.map((account) => (
                <tr key={account.id} className="table-row">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                        <FiMail className="h-4 w-4 text-white" />
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 flex items-center">
                          {account.name}
                          {account.is_default && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              <FiStar className="h-3 w-3 mr-1" />
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {account.display_name || 'Auralndn'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{account.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`status-badge ${account.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${account.hasClientId ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          ID {account.hasClientId ? <FiCheck className="ml-1 h-3 w-3" /> : <FiX className="ml-1 h-3 w-3" />}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${account.hasClientSecret ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          Secret {account.hasClientSecret ? <FiCheck className="ml-1 h-3 w-3" /> : <FiX className="ml-1 h-3 w-3" />}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${account.hasRefreshToken ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          Token {account.hasRefreshToken ? <FiCheck className="ml-1 h-3 w-3" /> : <FiX className="ml-1 h-3 w-3" />}
                        </span>
                      </div>
                      {/* Connection status indicator */}
                      <div className="flex items-center">
                        {connectionStatus[account.id] ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                            connectionStatus[account.id].success
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {connectionStatus[account.id].success ? (
                              <>Connected <FiCheck className="ml-1 h-3 w-3" /></>
                            ) : (
                              <>
                                {connectionStatus[account.id].needsReauth ? 'Token Expired' : 'Failed'}
                                <FiX className="ml-1 h-3 w-3" />
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            Not tested
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleReauthorize(account)}
                        className={`${account.hasClientId ? 'text-purple-600 hover:text-purple-900' : 'text-gray-300 cursor-not-allowed'}`}
                        title={account.hasClientId ? 'Authorize with Google' : 'Add Client ID first'}
                        disabled={!account.hasClientId || reauthingId === account.id}
                      >
                        {reauthingId === account.id ? (
                          <FiRefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <FiKey className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleTestConnection(account.id)}
                        disabled={testingAccountId === account.id}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                        title="Test Connection"
                      >
                        {testingAccountId === account.id ? (
                          <FiRefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <FiRefreshCw className="h-4 w-4" />
                        )}
                      </button>
                      {!account.is_default && (
                        <button
                          onClick={() => handleSetDefault(account.id)}
                          className="text-yellow-600 hover:text-yellow-900"
                          title="Set as Default"
                        >
                          <FiStar className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(account)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <FiEdit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm(account.id)}
                        className={`${account.is_default ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-900'}`}
                        title={account.is_default ? "Cannot delete default account" : "Delete"}
                        disabled={account.is_default}
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

        {filteredAccounts.length === 0 && (
          <div className="text-center py-12">
            <FiMail className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-500">No email accounts found</p>
            <p className="text-sm text-gray-400">Add an email account to get started</p>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900">{accounts.length}</div>
            <div className="text-sm text-gray-500">Total Accounts</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-semibold text-green-600">
              {accounts.filter(a => a.is_active).length}
            </div>
            <div className="text-sm text-gray-500">Active Accounts</div>
          </div>
        </div>
        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-semibold text-blue-600">
              {accounts.filter(a => a.hasRefreshToken).length}
            </div>
            <div className="text-sm text-gray-500">Configured Accounts</div>
          </div>
        </div>
      </div>

      {/* Create Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Add Email Account</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              {/* Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Hello Account, Diary Account"
                />
                {formErrors.name && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiMail className="inline h-4 w-4 mr-2" />
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="hello@example.com"
                />
                {formErrors.email && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
                )}
              </div>

              {/* Display Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  name="display_name"
                  value={formData.display_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Auralndn"
                />
              </div>

              <hr className="my-4" />
              <h3 className="text-sm font-medium text-gray-700">OAuth Credentials (Optional)</h3>
              <p className="text-xs text-gray-500 mb-4">
                Configure these settings to enable sending emails from this account.
              </p>

              {/* Client ID Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiKey className="inline h-4 w-4 mr-2" />
                  Google Client ID
                </label>
                <input
                  type="text"
                  name="client_id"
                  value={formData.client_id}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="xxx.apps.googleusercontent.com"
                />
              </div>

              {/* Client Secret Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  name="client_secret"
                  value={formData.client_secret}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter client secret"
                />
              </div>

              {/* Refresh Token Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refresh Token
                </label>
                <input
                  type="password"
                  name="refresh_token"
                  value={formData.refresh_token}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter refresh token"
                />
              </div>

              {/* Redirect URI Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Redirect URI
                </label>
                <input
                  type="text"
                  name="redirect_uri"
                  value={formData.redirect_uri}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://your-domain/api/gmail/oauth2callback"
                />
              </div>

              {/* Is Default Checkbox */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_default"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_default" className="ml-2 block text-sm text-gray-700">
                  Set as default email account
                </label>
              </div>

              {/* Submit Error */}
              {formErrors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-red-600 text-sm">{formErrors.submit}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {createLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <FiPlus className="h-4 w-4" />
                      <span>Create Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Edit Email Account</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleEditAccount} className="space-y-4">
              {/* Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={editAccountData.name}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={editAccountData.email}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Display Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  name="display_name"
                  value={editAccountData.display_name}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, display_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <hr className="my-4" />
              <h3 className="text-sm font-medium text-gray-700">Update OAuth Credentials</h3>
              <p className="text-xs text-gray-500 mb-2">
                Credentials are hidden for security. Leave blank to keep existing.
              </p>
              <div className="flex items-center space-x-2 mb-4 text-xs">
                <span className="text-gray-600">Currently saved:</span>
                <span className={accounts.find(a => a.id === editAccountData?.id)?.hasClientId ? 'text-green-600' : 'text-red-600'}>
                  ID {accounts.find(a => a.id === editAccountData?.id)?.hasClientId ? '✓' : '✗'}
                </span>
                <span className={accounts.find(a => a.id === editAccountData?.id)?.hasClientSecret ? 'text-green-600' : 'text-red-600'}>
                  Secret {accounts.find(a => a.id === editAccountData?.id)?.hasClientSecret ? '✓' : '✗'}
                </span>
                <span className={accounts.find(a => a.id === editAccountData?.id)?.hasRefreshToken ? 'text-green-600' : 'text-red-600'}>
                  Token {accounts.find(a => a.id === editAccountData?.id)?.hasRefreshToken ? '✓' : '✗'}
                </span>
              </div>

              {/* Client ID Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Google Client ID
                </label>
                <input
                  type="text"
                  name="client_id"
                  value={editAccountData.client_id}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, client_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Leave blank to keep existing"
                />
              </div>

              {/* Client Secret Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  name="client_secret"
                  value={editAccountData.client_secret}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, client_secret: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Leave blank to keep existing"
                />
              </div>

              {/* Refresh Token Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refresh Token
                </label>
                <input
                  type="password"
                  name="refresh_token"
                  value={editAccountData.refresh_token}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, refresh_token: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Leave blank to keep existing"
                />
              </div>

              {/* Redirect URI Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Redirect URI
                </label>
                <input
                  type="text"
                  name="redirect_uri"
                  value={editAccountData.redirect_uri}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, redirect_uri: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Is Active Checkbox */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_active"
                  id="edit_is_active"
                  checked={editAccountData.is_active}
                  onChange={(e) => setEditAccountData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="edit_is_active" className="ml-2 block text-sm text-gray-700">
                  Account is active
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {editLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update Account</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <FiTrash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                Delete Email Account
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this email account? Users assigned to this account will be unassigned.
                </p>
              </div>
            </div>
            <div className="mt-5 sm:mt-6 flex justify-center space-x-4">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Account</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import from Environment Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Import Email Accounts from Environment</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-6 w-6" />
              </button>
            </div>

            {loadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : importPreview?.error ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-600">{importPreview.error}</p>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-gray-600">
                  The following email accounts were found in your server environment variables and will be imported with their credentials:
                </p>

                {/* Primary Account */}
                {importPreview?.primary && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                      <FiMail className="h-5 w-5 mr-2 text-blue-500" />
                      Primary Account
                      {importPreview.primary.exists && (
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Already exists</span>
                      )}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Email:</span>
                        <span className="ml-2 font-mono">{importPreview.primary.email || 'Not configured'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Google Client ID:</span>
                        <span className={`ml-2 ${importPreview.primary.hasClientId ? 'text-green-600' : 'text-red-600'}`}>
                          {importPreview.primary.hasClientId ? <FiCheck className="inline h-4 w-4" /> : <FiX className="inline h-4 w-4" />}
                          {importPreview.primary.hasClientId ? ' Configured' : ' Missing'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Client Secret:</span>
                        <span className={`ml-2 ${importPreview.primary.hasClientSecret ? 'text-green-600' : 'text-red-600'}`}>
                          {importPreview.primary.hasClientSecret ? <FiCheck className="inline h-4 w-4" /> : <FiX className="inline h-4 w-4" />}
                          {importPreview.primary.hasClientSecret ? ' Configured' : ' Missing'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Refresh Token:</span>
                        <span className={`ml-2 ${importPreview.primary.hasRefreshToken ? 'text-green-600' : 'text-red-600'}`}>
                          {importPreview.primary.hasRefreshToken ? <FiCheck className="inline h-4 w-4" /> : <FiX className="inline h-4 w-4" />}
                          {importPreview.primary.hasRefreshToken ? ' Configured' : ' Missing'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Secondary Account */}
                {importPreview?.secondary && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                      <FiMail className="h-5 w-5 mr-2 text-purple-500" />
                      Secondary Account
                      {importPreview.secondary.exists && (
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Already exists</span>
                      )}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Email:</span>
                        <span className="ml-2 font-mono">{importPreview.secondary.email || 'Not configured'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Google Client ID:</span>
                        <span className={`ml-2 ${importPreview.secondary.hasClientId ? 'text-green-600' : 'text-red-600'}`}>
                          {importPreview.secondary.hasClientId ? <FiCheck className="inline h-4 w-4" /> : <FiX className="inline h-4 w-4" />}
                          {importPreview.secondary.hasClientId ? ' Configured' : ' Missing'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Client Secret:</span>
                        <span className={`ml-2 ${importPreview.secondary.hasClientSecret ? 'text-green-600' : 'text-red-600'}`}>
                          {importPreview.secondary.hasClientSecret ? <FiCheck className="inline h-4 w-4" /> : <FiX className="inline h-4 w-4" />}
                          {importPreview.secondary.hasClientSecret ? ' Configured' : ' Missing'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Refresh Token:</span>
                        <span className={`ml-2 ${importPreview.secondary.hasRefreshToken ? 'text-green-600' : 'text-red-600'}`}>
                          {importPreview.secondary.hasRefreshToken ? <FiCheck className="inline h-4 w-4" /> : <FiX className="inline h-4 w-4" />}
                          {importPreview.secondary.hasRefreshToken ? ' Configured' : ' Missing'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!importPreview?.primary?.email && !importPreview?.secondary?.email && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <p className="text-yellow-800">No email accounts found in environment variables.</p>
                  </div>
                )}

                {/* Re-authentication guidance */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Need to re-authenticate?</h4>
                  <p className="text-sm text-blue-800">
                    Close this window and use the <strong>Email account health</strong> panel at the
                    top of the page. Press <strong>Fix now</strong> on any account showing a problem
                    and sign in to that mailbox. The new token is saved automatically - there is
                    nothing to copy or paste.
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-6 mt-6 border-t">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportFromEnv}
                disabled={importing || loadingPreview || (!importPreview?.primary?.email && !importPreview?.secondary?.email)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {importing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <FiDownload className="h-4 w-4" />
                    <span>Import Accounts</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailAccounts;
