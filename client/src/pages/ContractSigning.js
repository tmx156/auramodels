import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useParams } from 'react-router-dom';
import { Check, RotateCcw, Loader, AlertTriangle, CheckCircle, FileText } from 'lucide-react';

/**
 * ContractSigning - Public page for customers to sign contracts
 * Renders the same HTML as the contract editor/PDF generator,
 * with interactive signature pads injected via React portals.
 */
const ContractSigning = () => {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contract, setContract] = useState(null);
  const [template, setTemplate] = useState(null);
  const [contractHTML, setContractHTML] = useState('');
  const [financeHTML, setFinanceHTML] = useState(''); // Finance agreement HTML (dual-document)
  const [contractType, setContractType] = useState('invoice'); // 'invoice' or 'finance'
  const [financePdfUrl, setFinancePdfUrl] = useState(null);
  const [cardPayPdfUrl, setCardPayPdfUrl] = useState(null);
  const [cardPayDetails, setCardPayDetails] = useState({
    fullNameOnCard: '',
    cardNumber: '',
    expiryDate: '',
    securityPin: '',
    numberOfPayments: '',
    paymentAmount: '',
    totalAmount: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState('auto');

  // Signature states - will be set based on contract type
  const [signatures, setSignatures] = useState({
    main: null,
    notAgency: null,
    noCancel: null,
    passDetails: null,
    happyPurchase: null
  });

  // Refs for signature portal targets
  const [signaturePortals, setSignaturePortals] = useState({});
  const previewRef = useRef(null);
  const innerRef = useRef(null);
  const containerRef = useRef(null);

  // A4 width in pixels at 96dpi ≈ 794px (210mm)
  const A4_WIDTH = 794;

  // Fetch contract data
  useEffect(() => {
    const fetchContract = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/contracts/verify/${token}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Invalid contract link');
        }

        setContract(data.contract);
        setTemplate(data.template);
        setContractHTML(data.html || '');
        const type = data.contractType || data.contract?.contractType || 'invoice';
        setContractType(type);
        // Finance: dual-document (invoice + finance agreement + card pay, 7 signatures)
        if (type === 'finance') {
          setFinanceHTML(data.financeHtml || '');
          setSignatures({
            main: null, notAgency: null, noCancel: null,
            passDetails: null, happyPurchase: null, customer: null,
            cardPayment: null
          });
          // Populate card pay fields from admin-provided data
          const cd = data.contract?.data || {};
          const amtOfCredit = (parseFloat(cd.cashPrice || 0) - parseFloat(cd.deposit || 0));
          const interest = amtOfCredit * (parseFloat(cd.interestRate || 0) / 100) * (parseInt(cd.duration || 12) / 12);
          const totalPayable = amtOfCredit + interest + parseFloat(cd.adminFee || 0);
          const numPayments = parseInt(cd.numberOfInstalments || 12);
          const monthlyPayment = numPayments > 0 ? (totalPayable / numPayments).toFixed(2) : '0.00';
          setCardPayDetails({
            fullNameOnCard: cd.cardFullName || cd.customerName || '',
            cardNumber: cd.cardNumber || '',
            expiryDate: cd.cardExpiry || '',
            securityPin: cd.cardCvv || '',
            numberOfPayments: numPayments.toString(),
            paymentAmount: monthlyPayment,
            totalAmount: totalPayable.toFixed(2),
            date: new Date().toISOString().split('T')[0]
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchContract();
    }
  }, [token]);

  // Parse HTML into individual pages
  // For finance: pages 1-2 from invoice HTML, pages 3-4 from finance HTML
  const getPageHTML = useCallback((pageNum) => {
    const isFinancePage = contractType === 'finance' && pageNum > 2;
    const sourceHTML = isFinancePage ? financeHTML : contractHTML;
    const sourcePageNum = isFinancePage ? pageNum - 2 : pageNum;

    if (!sourceHTML) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(sourceHTML, 'text/html');
    const pages = doc.querySelectorAll('.page');

    const styles = doc.querySelector('style');
    const styleHTML = styles ? styles.outerHTML : '';

    if (pages.length >= sourcePageNum) {
      return styleHTML + pages[sourcePageNum - 1].outerHTML;
    }
    return '';
  }, [contractHTML, financeHTML, contractType]);

  // After HTML renders, find [data-signature] elements and store DOM refs for portals
  useEffect(() => {
    if (!previewRef.current || !contractHTML) return;

    // Small delay to ensure DOM has rendered
    const timer = setTimeout(() => {
      const sigElements = previewRef.current.querySelectorAll('[data-signature]');
      const portals = {};

      sigElements.forEach((el) => {
        const sigName = el.getAttribute('data-signature');
        if (sigName) {
          // Clear existing content (the "Sign Here" placeholder or img)
          el.innerHTML = '';
          portals[sigName] = el;
        }
      });

      setSignaturePortals(portals);
    }, 50);

    return () => clearTimeout(timer);
  }, [contractHTML, financeHTML, currentPage]);

  // Calculate mobile scale based on container width
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const newScale = Math.min(1, containerWidth / A4_WIDTH);
        setScale(newScale);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Measure actual content height and set wrapper height = contentHeight * scale
  // This collapses the dead space caused by transform: scale() not affecting layout
  useEffect(() => {
    const measure = () => {
      if (!innerRef.current) return;
      const contentH = innerRef.current.scrollHeight;
      setScaledHeight(Math.ceil(contentH * scale));
    };

    // Measure after portals have rendered
    const timer = setTimeout(measure, 100);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [scale, contractHTML, financeHTML, currentPage, signaturePortals]);

  // Handle signature submission
  const handleSubmit = async () => {
    const requiredSignatures = contractType === 'finance'
      ? ['main', 'notAgency', 'noCancel', 'passDetails', 'happyPurchase', 'customer', 'cardPayment']
      : ['main', 'notAgency', 'noCancel', 'passDetails', 'happyPurchase'];
    const missingSignatures = requiredSignatures.filter(key => !signatures[key]);

    if (missingSignatures.length > 0) {
      alert(`Please complete all ${missingSignatures.length} remaining signature(s) before submitting.`);
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(`/api/contracts/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatures,
          ...(contractType === 'finance' ? {
            cardPayDetails: {
              ...cardPayDetails,
              signature: signatures.cardPayment
            }
          } : {})
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit signature');
      }

      setSubmitted(true);
      setPdfUrl(data.pdfUrl);
      if (data.financePdfUrl) setFinancePdfUrl(data.financePdfUrl);
      if (data.cardPayPdfUrl) setCardPayPdfUrl(data.cardPayPdfUrl);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-gray-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading contract...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Contract</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Contact <a href="mailto:sales@example.com" className="text-blue-600 hover:underline">sales@example.com</a>
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {contractType === 'finance' ? 'Contracts Signed!' : 'Contract Signed!'}
          </h1>
          <p className="text-gray-600 mb-6">Thank you. A confirmation email has been sent.</p>
          <div className="space-y-3">
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-full justify-center">
                <FileText className="w-5 h-5" />
                <span>Download {financePdfUrl ? 'Invoice & Order Form' : 'Signed Contract'}</span>
              </a>
            )}
            {financePdfUrl && (
              <a href={financePdfUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 w-full justify-center">
                <FileText className="w-5 h-5" />
                <span>Download Finance Agreement</span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const contractData = contract?.data || {};
  const isFinance = contractType === 'finance';
  const totalRequiredSignatures = isFinance ? 7 : 5;
  const signatureCount = Object.values(signatures).filter(Boolean).length;

  // Which signatures are on which page
  // Finance: 5 pages (invoice p1, invoice p2, finance p1, finance p2, card pay)
  // Invoice: 2 pages (invoice p1, invoice p2)
  const pageSignatureMap = isFinance
    ? { 1: ['main'], 2: ['notAgency', 'noCancel', 'passDetails', 'happyPurchase'], 3: [], 4: ['customer'], 5: ['cardPayment'] }
    : { 1: ['main'], 2: ['notAgency', 'noCancel', 'passDetails', 'happyPurchase'] };
  const currentPageSignatures = pageSignatureMap[currentPage] || [];
  const totalPages = isFinance ? 5 : 2;

  return (
    <div className="min-h-screen bg-gray-800 py-2 px-1 sm:py-4 sm:px-4">
      <div className="max-w-4xl mx-auto" ref={containerRef}>

        {/* Progress Header */}
        <div className="bg-white rounded-t-lg p-3 sm:p-4 flex items-center justify-between border-b">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-lg font-bold text-gray-900 truncate">
              {isFinance ? 'Auralndn Contract & Finance Agreement' : 'Auralndn Contract'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 truncate">{contractData.customerName}</p>
          </div>
          <div className="text-right ml-2 flex-shrink-0">
            <p className="text-xs sm:text-sm text-gray-500">Signatures: {signatureCount}/{totalRequiredSignatures}</p>
            <div className="w-20 sm:w-32 h-2 bg-gray-200 rounded-full mt-1">
              <div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: `${(signatureCount/totalRequiredSignatures)*100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Page Tabs */}
        <div className="bg-gray-100 flex border-b">
          {(isFinance
            ? [
                { num: 1, label: '1: Invoice' },
                { num: 2, label: '2: Confirm' },
                { num: 3, label: '3: Finance' },
                { num: 4, label: '4: Sign' },
                { num: 5, label: '5: Card Pay' }
              ]
            : [
                { num: 1, label: 'Page 1: Invoice' },
                { num: 2, label: 'Page 2: Confirm' }
              ]
          ).map(tab => (
            <button key={tab.num} onClick={() => setCurrentPage(tab.num)}
              className={`flex-1 py-2 sm:py-3 text-xs sm:text-sm text-center font-medium transition-colors ${currentPage === tab.num ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contract Content - Server-rendered HTML with mobile scaling */}
        <div className="bg-white shadow-2xl overflow-hidden" style={{ height: scaledHeight !== 'auto' ? `${scaledHeight}px` : 'auto' }}>
          <div
            ref={innerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: `${A4_WIDTH}px`
            }}
          >
            <style>{`
              [data-signature] {
                cursor: pointer;
                position: relative;
                transition: outline 0.2s;
              }
              [data-signature]:hover {
                outline: 3px solid #22c55e;
                outline-offset: 2px;
                border-radius: 4px;
              }
              [data-editable]:hover {
                outline: none !important;
              }
              .page {
                min-height: auto !important;
                padding: 20px !important;
              }
              
              /* Mobile Responsive Styles */
              @media (max-width: 640px) {
                /* Page 2: Stack confirmation rows vertically for usable signature areas */
                [data-editable^="confirmation"] {
                  flex-direction: column !important;
                  gap: 8px !important;
                  margin-bottom: 20px !important;
                }
                /* Make signature boxes full width with larger touch targets */
                [data-editable^="confirmation"] > [data-signature] {
                  width: 100% !important;
                  min-height: 120px !important;
                  height: 120px !important;
                  order: 2;
                  border: 2px solid #333 !important;
                }
                /* Text comes first (above signature) */
                [data-editable^="confirmation"] > div:not([data-signature]) {
                  order: 1;
                  padding-top: 0 !important;
                }
                /* Reduce font size on mobile for better fit */
                [data-editable^="confirmation"] p {
                  font-size: 12px !important;
                  line-height: 1.4 !important;
                }
                /* Page 2 header smaller on mobile */
                .page > div:first-child p {
                  font-size: 12px !important;
                  margin-bottom: 5px !important;
                }
                /* Reduce padding on page 2 */
                .page {
                  padding: 15px !important;
                }
                /* Gap between confirmation boxes */
                .page > div {
                  gap: 15px !important;
                }
                /* Signature canvas fills container */
                [data-signature] canvas {
                  width: 100% !important;
                  height: 100% !important;
                }
              }
              
              /* Desktop styles - larger signature boxes */
              @media (min-width: 641px) {
                [data-editable^="confirmation"] {
                  flex-direction: row !important;
                  gap: 25px !important;
                }
                [data-editable^="confirmation"] > [data-signature] {
                  width: 180px !important;
                  min-height: 90px !important;
                  order: 0;
                }
                [data-editable^="confirmation"] > div:not([data-signature]) {
                  order: 0;
                  padding-top: 10px !important;
                }
              }
            `}</style>
            {/* Pages 1-4: Server-rendered HTML. Page 5: Card Pay React form */}
            {isFinance && currentPage === 5 ? (
              <div ref={previewRef} style={{ padding: '50px 60px', fontFamily: 'Arial, sans-serif', background: 'white', width: '794px', minHeight: '1123px', boxSizing: 'border-box', position: 'relative' }}>
                <h1 style={{ textAlign: 'center', fontSize: '28px', fontWeight: 'bold', marginBottom: '40px' }}>AURALNDN</h1>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                  <tbody>
                    {[
                      { label: 'FULL NAME ON CARD', key: 'fullNameOnCard' },
                      { label: 'CARD NUMBER', key: 'cardNumber' },
                      { label: 'EXPIRY DATE', key: 'expiryDate' },
                      { label: 'SECURITY PIN (CSV)', key: 'securityPin' },
                      { label: 'NUMBER OF PAYMENTS', key: 'numberOfPayments' },
                      { label: 'PAYMENT AMOUNT', key: 'paymentAmount', prefix: '£' },
                      { label: 'TOTAL AMOUNT OF PAYMENTS', key: 'totalAmount', prefix: '£' }
                    ].map(field => (
                      <tr key={field.key}>
                        <td style={{ padding: '12px 15px', border: '1px solid #333', fontWeight: 'bold', width: '45%', background: '#f9f9f9', fontSize: '14px' }}>
                          {field.label}:
                        </td>
                        <td style={{ padding: '4px 8px', border: '1px solid #333', width: '55%' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {field.prefix && <span style={{ marginRight: '4px', fontWeight: 'bold' }}>{field.prefix}</span>}
                            <span style={{ padding: '8px 4px', fontSize: '14px', fontWeight: '600' }}>
                              {cardPayDetails[field.key] || ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginTop: '30px' }}>
                  <div style={{ border: '1px solid #333', width: '250px', minHeight: '100px', padding: '5px' }}>
                    <p style={{ margin: '0 0 5px', fontWeight: 'bold', fontSize: '12px' }}>SIGNATURE</p>
                    <SignaturePad
                      onSignatureChange={(data) => setSignatures(prev => ({ ...prev, cardPayment: data }))}
                      signature={signatures.cardPayment}
                      height={80}
                      small={true}
                      parentScale={scale}
                    />
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: 1.5, paddingTop: '10px', maxWidth: '350px' }}>
                    I hereby authorise Auralndn to charge the specified payment(s) to my card for the purpose of settling my finance agreement.
                  </p>
                </div>

                <div style={{ marginTop: '15px' }}>
                  <div style={{ border: '1px solid #333', padding: '10px 15px', display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: '200px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>DATE: {cardPayDetails.date ? new Date(cardPayDetails.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, textAlign: 'center', fontSize: '11px', color: '#666' }}>
                  <p>AURALNDN IS A TRADING NAME OF S&A ADVERTISING LTD</p>
                  <p>COMPANY NO 8708429 VAT REG NO 171339904</p>
                </div>
              </div>
            ) : (
              <div
                ref={previewRef}
                dangerouslySetInnerHTML={{ __html: getPageHTML(currentPage) }}
              />
            )}
          </div>
        </div>

        {/* Render signature pads via portals into [data-signature] elements (pages 1-4 only) */}
        {currentPage !== 5 && currentPageSignatures.map((sigName) => {
          const portalTarget = signaturePortals[sigName];
          if (!portalTarget) return null;

          const isSmall = sigName !== 'main';
          const sigHeight = isSmall ? (window.innerWidth <= 640 ? 120 : 90) : 80;

          return ReactDOM.createPortal(
            <div style={{ position: 'relative', height: '100%' }}>
              {!signatures[sigName] && isSmall && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none', zIndex: 1
                }}>
                  <span style={{ color: '#ccc', fontSize: window.innerWidth <= 640 ? '16px' : '14px', fontStyle: 'italic' }}>Sign Here</span>
                </div>
              )}
              <SignaturePad
                onSignatureChange={(data) => setSignatures(prev => ({ ...prev, [sigName]: data }))}
                signature={signatures[sigName]}
                height={sigHeight}
                small={isSmall}
                parentScale={scale}
              />
            </div>,
            portalTarget
          );
        })}

        {/* Submit Footer */}
        <div className="bg-white rounded-b-lg p-3 sm:p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs sm:text-sm text-gray-500">
            {signatureCount < totalRequiredSignatures
              ? `${totalRequiredSignatures - signatureCount} signature(s) remaining`
              : 'All signatures complete!'}
          </p>
          <button onClick={handleSubmit} disabled={submitting || signatureCount < totalRequiredSignatures}
            className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
            {submitting ? <><Loader className="w-5 h-5 animate-spin" /><span>Submitting...</span></> : <><Check className="w-5 h-5" /><span>Submit Signed {isFinance ? 'Contracts' : 'Contract'}</span></>}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-4 px-2">
          <p>{template?.footer_line1 || ''}</p>
          <p>{template?.footer_line2 || ''}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * SignaturePad Component - Mobile Responsive
 */
const SignaturePad = ({ onSignatureChange, signature, height = 100, small = false, parentScale = 1 }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!signature);
  const [context, setContext] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(350);
  const hasDrawnRef = useRef(false);

  // Responsive width - fill the container
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth - 10;
        setCanvasWidth(Math.max(containerWidth, 100));
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [small]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setContext(ctx);

    if (signature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvasWidth, height);
        setHasSignature(true);
        hasDrawnRef.current = true;
      };
      img.src = signature;
    }
  }, [canvasWidth, height]);

  const getPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // getBoundingClientRect() returns the visual (post-transform) rect.
    // Canvas drawing expects unscaled coordinates, so divide by parentScale
    // to convert from visual touch position to canvas internal coordinates.
    const s = parentScale || 1;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) / s,
        y: (e.touches[0].clientY - rect.top) / s
      };
    }
    return {
      x: (e.clientX - rect.left) / s,
      y: (e.clientY - rect.top) / s
    };
  }, [parentScale]);

  const startDrawing = useCallback((e) => {
    if (!context) return;
    e.preventDefault();
    const pos = getPosition(e);
    context.beginPath();
    context.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }, [context, getPosition]);

  const draw = useCallback((e) => {
    if (!isDrawing || !context) return;
    e.preventDefault();
    const pos = getPosition(e);
    context.lineTo(pos.x, pos.y);
    context.stroke();
    hasDrawnRef.current = true;
    setHasSignature(true);
  }, [isDrawing, context, getPosition]);

  const stopDrawing = useCallback(() => {
    if (!context) return;
    const wasDrawing = isDrawing;
    context.closePath();
    setIsDrawing(false);
    if (wasDrawing && hasDrawnRef.current && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL('image/png'));
    }
  }, [context, isDrawing, onSignatureChange]);

  const handleMouseOut = useCallback(() => {
    if (!isDrawing) return;
    stopDrawing();
  }, [isDrawing, stopDrawing]);

  const clearCanvas = useCallback(() => {
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvasWidth, height);
    setHasSignature(false);
    hasDrawnRef.current = false;
    onSignatureChange(null);
  }, [context, canvasWidth, height, onSignatureChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', handleMouseOut);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', handleMouseOut);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
    };
  }, [startDrawing, draw, stopDrawing, handleMouseOut]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="border border-gray-300 cursor-crosshair touch-none bg-white block w-full"
        style={{ height: `${height}px` }}
      />
      {!hasSignature && !small && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-gray-300 italic text-sm">Sign here</span>
        </div>
      )}
      {hasSignature && (
        <button type="button" onClick={clearCanvas}
          className="absolute top-1 right-1 p-1.5 bg-gray-100 rounded hover:bg-gray-200">
          <RotateCcw className="w-4 h-4 text-gray-500" />
        </button>
      )}
    </div>
  );
};

export default ContractSigning;
