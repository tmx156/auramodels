import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, CheckCircle, X, Loader, AlertTriangle, Download, PenTool } from 'lucide-react';

/**
 * SignContract - Public page for customers to view and sign contracts
 * No authentication required - uses token from URL
 */
const SignContract = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  
  // Signature fields
  const [signatures, setSignatures] = useState({
    main: '',
    notAgency: false,
    noCancel: false,
    passDetails: false,
    happyPurchase: false
  });

  // PDF blob URL for preview
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  // Fetch contract data
  useEffect(() => {
    if (!token) {
      setError('Invalid contract link');
      setLoading(false);
      return;
    }

    const fetchContract = async () => {
      try {
        const response = await axios.get(`/api/contracts/verify/${token}`);
        
        if (response.data.success && response.data.contract) {
          setContract(response.data.contract);
          
          // Check if already signed
          if (response.data.contract.status === 'signed') {
            setSigned(true);
          }
        } else {
          setError('Contract not found or invalid');
        }
      } catch (err) {
        console.error('Error fetching contract:', err);
        if (err.response?.status === 404) {
          setError('Contract not found. The link may be invalid or expired.');
        } else if (err.response?.status === 410) {
          setError('This contract link has expired.');
        } else {
          setError(err.response?.data?.message || 'Failed to load contract');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchContract();
  }, [token]);

  // Handle signature submission
  const handleSign = async (e) => {
    e.preventDefault();
    
    if (!signatures.main.trim()) {
      alert('Please provide your signature');
      return;
    }

    setSigning(true);
    try {
      const response = await axios.post(`/api/contracts/sign/${token}`, {
        signatures: {
          main: signatures.main,
          notAgency: signatures.notAgency,
          noCancel: signatures.noCancel,
          passDetails: signatures.passDetails,
          happyPurchase: signatures.happyPurchase
        }
      });

      if (response.data.success) {
        setSigned(true);
        setContract(prev => ({ ...prev, status: 'signed' }));
      } else {
        throw new Error(response.data.message || 'Failed to sign contract');
      }
    } catch (err) {
      console.error('Error signing contract:', err);
      alert(err.response?.data?.message || 'Failed to sign contract. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `£${parseFloat(amount || 0).toFixed(2)}`;
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  // Ref to track blob URL for cleanup
  const pdfBlobUrlRef = useRef(null);

  // Fetch PDF as blob to avoid cross-origin issues
  useEffect(() => {
    if (!token || !contract) return;

    const fetchPdf = async () => {
      setPdfLoading(true);
      setPdfError(null);

      try {
        // Fetch PDF from API (uses relative URL, works with proxy)
        const response = await fetch(`/api/contracts/preview/${token}`);

        if (!response.ok) {
          const text = await response.text();
          console.error('PDF fetch failed:', response.status, text);
          throw new Error('Failed to load PDF');
        }

        // Verify it's actually a PDF
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/pdf')) {
          console.error('Response is not a PDF:', contentType);
          throw new Error('Invalid response - not a PDF');
        }

        // Get as blob
        const blob = await response.blob();
        console.log('PDF blob received, size:', blob.size);

        // Revoke old URL if exists
        if (pdfBlobUrlRef.current) {
          URL.revokeObjectURL(pdfBlobUrlRef.current);
        }

        // Create blob URL
        const url = URL.createObjectURL(blob);
        pdfBlobUrlRef.current = url;
        setPdfBlobUrl(url);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setPdfError(err.message);
      } finally {
        setPdfLoading(false);
      }
    };

    fetchPdf();

    // Cleanup blob URL on unmount
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, [token, contract]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading contract...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Contract Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!contract || !contract.data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No contract data available</p>
        </div>
      </div>
    );
  }

  const contractData = contract.data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Auralndn Contract</h1>
                <p className="text-gray-600 text-sm">
                  {contractData.customerName || 'Customer'} • Invoice #{contractData.invoiceNumber || 'N/A'}
                </p>
              </div>
            </div>
            {signed && (
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="w-6 h-6" />
                <span className="font-medium">Signed</span>
              </div>
            )}
          </div>
        </div>

        {/* PDF Preview Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Contract PDF Preview</h2>
            {pdfBlobUrl && (
              <a
                href={pdfBlobUrl}
                download="Auralndn_Contract.pdf"
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </a>
            )}
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100" style={{ height: '800px' }}>
            {pdfLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-600">Loading contract PDF...</p>
              </div>
            ) : pdfError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Failed to Load PDF</h3>
                <p className="text-gray-600 mb-4">{pdfError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                className="w-full h-full"
                title="Contract PDF Preview"
                style={{ border: 'none' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Loader className="w-12 h-12 text-gray-400 animate-spin mb-4" />
                <p className="text-gray-600">Preparing PDF preview...</p>
              </div>
            )}
          </div>
        </div>

        {/* Contract Details */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Contract Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Customer Information */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">Customer Information</h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Name:</span> <span className="font-medium">{contractData.customerName || 'N/A'}</span></p>
                {contractData.clientNameIfDifferent && (
                  <p><span className="text-gray-500">Client Name:</span> <span className="font-medium">{contractData.clientNameIfDifferent}</span></p>
                )}
                <p><span className="text-gray-500">Address:</span> <span className="font-medium">{contractData.address || 'N/A'}</span></p>
                <p><span className="text-gray-500">Postcode:</span> <span className="font-medium">{contractData.postcode || 'N/A'}</span></p>
                <p><span className="text-gray-500">Phone:</span> <span className="font-medium">{contractData.phone || 'N/A'}</span></p>
                <p><span className="text-gray-500">Email:</span> <span className="font-medium">{contractData.email || 'N/A'}</span></p>
                {contractData.isVip && (
                  <p><span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">VIP Customer</span></p>
                )}
              </div>
            </div>

            {/* Studio Information */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">Studio Information</h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Studio No:</span> <span className="font-medium">{contractData.studioNumber || 'N/A'}</span></p>
                <p><span className="text-gray-500">Photographer:</span> <span className="font-medium">{contractData.photographer || 'N/A'}</span></p>
                <p><span className="text-gray-500">Invoice No:</span> <span className="font-medium">{contractData.invoiceNumber || 'N/A'}</span></p>
                <p><span className="text-gray-500">Date:</span> <span className="font-medium">{formatDate(contractData.date)}</span></p>
              </div>
            </div>
          </div>

          {/* Order Details */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Order Details</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                {contractData.digitalImages ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-gray-400" />
                )}
                <span>Digital Images: {contractData.digitalImagesQty || 'All'}</span>
              </div>
              <div className="flex items-center space-x-2">
                {contractData.digitalZCard ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-gray-400" />
                )}
                <span>Digital Z-Card</span>
              </div>
              <div className="flex items-center space-x-2">
                {contractData.efolio ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-gray-400" />
                )}
                <span>E-Folio {contractData.efolioUrl && `(${contractData.efolioUrl})`}</span>
              </div>
              <div className="flex items-center space-x-2">
                {contractData.projectInfluencer ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-gray-400" />
                )}
                <span>Project Influencer</span>
              </div>
              <div className="flex items-center space-x-2">
                {contractData.allowImageUse ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-gray-400" />
                )}
                <span>Permission for image use in marketing</span>
              </div>
            </div>
            {contractData.notes && (
              <div className="mt-3 text-sm">
                <span className="text-gray-500">Notes: </span>
                <span>{contractData.notes}</span>
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Payment Details</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Subtotal (excl. VAT):</span>
                <span className="font-medium">{formatCurrency(contractData.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">VAT (20%):</span>
                <span className="font-medium">{formatCurrency(contractData.vatAmount)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                <span className="font-semibold text-lg">Total:</span>
                <span className="font-bold text-lg text-blue-600">{formatCurrency(contractData.total)}</span>
              </div>
              <div className="mt-3 text-sm text-gray-600">
                <span>Payment Method: </span>
                <span className="capitalize font-medium">{contractData.paymentMethod || 'Card'}</span>
                {contractData.authCode && (
                  <span className="ml-2">(Auth: {contractData.authCode})</span>
                )}
              </div>
            </div>
          </div>

          {/* Signing Section */}
          {!signed ? (
            <form onSubmit={handleSign} className="border-t pt-6">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center">
                <PenTool className="w-5 h-5 mr-2 text-blue-600" />
                Sign Contract
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Full Name (Signature) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={signatures.main}
                    onChange={(e) => setSignatures(prev => ({ ...prev, main: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={signatures.notAgency}
                      onChange={(e) => setSignatures(prev => ({ ...prev, notAgency: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">I confirm I am not an agency</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={signatures.noCancel}
                      onChange={(e) => setSignatures(prev => ({ ...prev, noCancel: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">I understand this contract cannot be cancelled</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={signatures.passDetails}
                      onChange={(e) => setSignatures(prev => ({ ...prev, passDetails: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">I agree to pass on details as required</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={signatures.happyPurchase}
                      onChange={(e) => setSignatures(prev => ({ ...prev, happyPurchase: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">I am happy with my purchase</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={signing || !signatures.main.trim()}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 font-medium"
                >
                  {signing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Signing...</span>
                    </>
                  ) : (
                    <>
                      <PenTool className="w-5 h-5" />
                      <span>Sign Contract</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="border-t pt-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-green-800 mb-2">Contract Signed Successfully</h3>
                <p className="text-green-600 text-sm mb-4">
                  Thank you for signing the contract. A copy has been sent to your email.
                </p>
                <a
                  href={`/api/contracts/${contract.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Signed PDF</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignContract;

