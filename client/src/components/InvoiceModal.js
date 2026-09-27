import React, { useState, useEffect } from 'react';
import { X, FileText, CreditCard, Check, Mail, Download, Loader, AlertCircle, CheckCircle, Clock, Send } from 'lucide-react';
import SignaturePad from './SignaturePad';

/**
 * InvoiceModal - Display invoice, record payment, collect signature
 * Complete sale workflow step
 */
const InvoiceModal = ({
  isOpen,
  onClose,
  invoice,
  lead,
  onPaymentRecorded,
  onSignatureSaved,
  onComplete,
  onSendSignatureEmail
}) => {
  const [paymentMethod, setPaymentMethod] = useState(invoice?.paymentMethod || 'pdq');
  const [authCode, setAuthCode] = useState(invoice?.authCode || '');
  const [paymentReference, setPaymentReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureData, setSignatureData] = useState(invoice?.clientSignatureData || null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Update local state when invoice changes
  useEffect(() => {
    if (invoice) {
      setPaymentMethod(invoice.paymentMethod || 'pdq');
      setAuthCode(invoice.authCode || '');
      setSignatureData(invoice.clientSignatureData || null);
    }
  }, [invoice]);

  // Format currency
  const formatCurrency = (amount) => {
    return `£${parseFloat(amount || 0).toFixed(2)}`;
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Record payment
  const handleRecordPayment = async () => {
    if (!authCode && paymentMethod === 'pdq') {
      setError('Please enter the PDQ authorisation code');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          paymentMethod,
          authCode: authCode || null,
          paymentReference: paymentReference || null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to record payment');
      }

      const data = await response.json();
      setSuccess('Payment recorded successfully');
      onPaymentRecorded?.(data.invoice);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error recording payment:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Save signature
  const handleSignatureSave = async (sigData) => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/save-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ signatureData: sigData })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save signature');
      }

      const data = await response.json();
      setSignatureData(sigData);
      setShowSignaturePad(false);
      setSuccess('Signature saved successfully');
      onSignatureSaved?.(data.invoice);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving signature:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Send signature email to client
  const handleSendSignatureEmail = async () => {
    setSendingEmail(true);
    setError(null);

    try {
      const response = await fetch('/api/signature/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          invoiceId: invoice.id,
          email: lead?.email || invoice.clientEmail
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to send signature email');
      }

      const data = await response.json();
      setSuccess(`Signature request sent to ${data.sentTo}`);
      onSendSignatureEmail?.(data);

      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error('Error sending signature email:', err);
      setError(err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  // Complete invoice
  const handleComplete = async () => {
    if (invoice.paymentStatus !== 'paid') {
      setError('Please record payment before completing');
      return;
    }

    if (invoice.signatureStatus !== 'signed' && !signatureData) {
      setError('Please collect signature before completing');
      return;
    }

    setCompleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ createSale: true })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to complete invoice');
      }

      const data = await response.json();
      setSuccess('Invoice completed! Delivery emails will be sent.');
      onComplete?.(data.invoice);

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error completing invoice:', err);
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  // Get status badge
  const getStatusBadge = (status, type) => {
    const configs = {
      payment: {
        pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' },
        paid: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Paid' },
        partial: { color: 'bg-blue-100 text-blue-800', icon: Clock, text: 'Partial' },
        refunded: { color: 'bg-red-100 text-red-800', icon: AlertCircle, text: 'Refunded' }
      },
      signature: {
        pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' },
        sent: { color: 'bg-blue-100 text-blue-800', icon: Send, text: 'Sent' },
        signed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Signed' },
        declined: { color: 'bg-red-100 text-red-800', icon: AlertCircle, text: 'Declined' }
      }
    };

    const config = configs[type]?.[status] || configs[type]?.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.text}
      </span>
    );
  };

  if (!isOpen || !invoice) return null;

  const isPaid = invoice.paymentStatus === 'paid';
  const isSigned = invoice.signatureStatus === 'signed' || signatureData;
  const canComplete = isPaid && isSigned;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                Invoice {invoice.invoiceNumber}
              </h2>
              <p className="text-blue-100 text-sm">
                {invoice.clientName || lead?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Alerts */}
        {(error || success) && (
          <div className={`mx-6 mt-4 p-4 rounded-lg flex items-start space-x-3 ${
            error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
          }`}>
            {error ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm">{error || success}</span>
            <button
              onClick={() => { setError(null); setSuccess(null); }}
              className="ml-auto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Invoice Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Client Info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-medium text-gray-900 mb-3">Client Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Name:</span>
                    <p className="font-medium">{invoice.clientName || lead?.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <p className="font-medium">{invoice.clientEmail || lead?.email || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Phone:</span>
                    <p className="font-medium">{invoice.clientPhone || lead?.phone || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Date:</span>
                    <p className="font-medium">{formatDate(invoice.createdAt)}</p>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(invoice.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          {item.includes && item.includes.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {item.includes.slice(0, 3).map((inc, i) => (
                                <li key={i} className="text-xs text-gray-500 flex items-center">
                                  <Check className="w-3 h-3 text-green-500 mr-1" />
                                  {inc}
                                </li>
                              ))}
                              {item.includes.length > 3 && (
                                <li className="text-xs text-gray-400">
                                  +{item.includes.length - 3} more
                                </li>
                              )}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{item.quantity || 1}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="3" className="px-4 py-2 text-right text-sm text-gray-600">Subtotal</td>
                      <td className="px-4 py-2 text-right text-sm font-medium">{formatCurrency(invoice.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3" className="px-4 py-2 text-right text-sm text-gray-600">VAT (20%)</td>
                      <td className="px-4 py-2 text-right text-sm font-medium">{formatCurrency(invoice.vatAmount)}</td>
                    </tr>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan="3" className="px-4 py-3 text-right text-lg font-semibold">Total</td>
                      <td className="px-4 py-3 text-right text-xl font-bold text-gray-900">{formatCurrency(invoice.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signature Section */}
              {showSignaturePad ? (
                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-medium text-gray-900 mb-4">Client Signature</h3>
                  <SignaturePad
                    onSave={handleSignatureSave}
                    onCancel={() => setShowSignaturePad(false)}
                    saving={saving}
                  />
                </div>
              ) : signatureData ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-green-900 flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Signature Collected
                    </h3>
                    <button
                      onClick={() => setShowSignaturePad(true)}
                      className="text-sm text-green-700 hover:text-green-900"
                    >
                      Re-sign
                    </button>
                  </div>
                  <div className="bg-white rounded-lg p-2 border">
                    <img
                      src={signatureData}
                      alt="Client signature"
                      className="max-h-24 mx-auto"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Actions Sidebar */}
            <div className="space-y-4">
              {/* Status Cards */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Payment</span>
                  {getStatusBadge(invoice.paymentStatus, 'payment')}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Signature</span>
                  {getStatusBadge(signatureData ? 'signed' : invoice.signatureStatus, 'signature')}
                </div>
              </div>

              {/* Payment Recording */}
              {!isPaid && (
                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Record Payment
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="pdq">PDQ Machine (Card)</option>
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {paymentMethod === 'pdq' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Authorisation Code *
                        </label>
                        <input
                          type="text"
                          value={authCode}
                          onChange={(e) => setAuthCode(e.target.value)}
                          placeholder="Enter auth code"
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reference (Optional)
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Transaction reference"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <button
                      onClick={handleRecordPayment}
                      disabled={saving}
                      className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {saving ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Record Payment</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Signature Collection */}
              {isPaid && !isSigned && (
                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Collect Signature</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowSignaturePad(true)}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Sign Here</span>
                    </button>
                    <button
                      onClick={handleSendSignatureEmail}
                      disabled={sendingEmail || !invoice.clientEmail}
                      className="w-full py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {sendingEmail ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      <span>Email Signature Link</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Complete Button */}
              <button
                onClick={handleComplete}
                disabled={!canComplete || completing}
                className={`w-full py-3 rounded-xl font-medium flex items-center justify-center space-x-2 transition-colors ${
                  canComplete
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {completing ? (
                  <Loader className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                <span>Complete Sale</span>
              </button>

              {!canComplete && (
                <p className="text-xs text-center text-gray-500">
                  {!isPaid ? 'Record payment first' : 'Collect signature to complete'}
                </p>
              )}

              {/* Download PDF */}
              {invoice.pdfUrl && (
                <a
                  href={invoice.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Invoice PDF</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;
