import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSave, FiRefreshCw, FiX, FiCheck, FiZoomIn, FiZoomOut, FiChevronLeft, FiChevronRight, FiBold, FiItalic, FiUnderline, FiType } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

// Rich Text Editor Component with formatting toolbar
const RichTextEditor = ({ value, onChange, rows = 4, placeholder, showFontSize = true }) => {
  const textareaRef = useRef(null);
  const [fontSize, setFontSize] = useState('normal');

  const insertTag = (openTag, closeTag) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const before = value.substring(0, start);
    const after = value.substring(end);

    const newValue = before + openTag + selectedText + closeTag + after;
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + openTag.length + selectedText.length + closeTag.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const wrapSelection = (tag) => {
    insertTag(`<${tag}>`, `</${tag}>`);
  };

  const applyFontSize = (size) => {
    setFontSize(size);
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const sizeMap = {
        small: '10px',
        normal: '14px',
        large: '18px',
        xlarge: '24px'
      };
      insertTag(`<span style="font-size: ${sizeMap[size]}">`, '</span>');
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
      <div className="bg-gray-50 border-b border-gray-200 px-2 py-1.5 flex items-center gap-1 flex-wrap">
        {showFontSize && (
          <div className="relative">
            <select
              value={fontSize}
              onChange={(e) => applyFontSize(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded px-2 py-1 text-xs pr-6 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Font Size"
            >
              <option value="small">Small</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="xlarge">X-Large</option>
            </select>
            <FiType className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
          </div>
        )}
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => wrapSelection('strong')}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-700"
          title="Bold (wraps in <strong>)"
        >
          <FiBold size={14} />
        </button>
        <button
          type="button"
          onClick={() => wrapSelection('em')}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-700"
          title="Italic (wraps in <em>)"
        >
          <FiItalic size={14} />
        </button>
        <button
          type="button"
          onClick={() => wrapSelection('u')}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-700"
          title="Underline (wraps in <u>)"
        >
          <FiUnderline size={14} />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => insertTag('<br/>', '')}
          className="px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 text-xs font-medium"
          title="Insert Line Break"
        >
          ↵ Break
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm focus:outline-none resize-none"
        style={{ minHeight: rows * 24 }}
      />
      <div className="bg-gray-50 border-t border-gray-200 px-3 py-1.5 text-xs text-gray-500">
        Select text and click a format button. Use <code className="bg-gray-200 px-1 rounded">&lt;strong&gt;</code> for bold.
      </div>
    </div>
  );
};

// Friendly names for the plain-label fields stored in the `labels` JSONB column.
// Keys match server/utils/contractLabels.js.
const LABEL_FIELD_NAMES = {
  header_date_label: 'Date label (header box)',
  info_customer_no: 'Customer number label',
  info_studio_no: 'Studio number label',
  info_photographer: 'Photographer label',
  info_invoice_no: 'Invoice number label',

  customer_details_heading: 'Section heading',
  customer_name_label: 'Name field label',
  customer_vip_label: 'VIP field label',
  customer_alt_name_label: 'Alternative name label',
  customer_address_label: 'Address label',
  customer_postcode_label: 'Postcode label',
  customer_phone_label: 'Phone label',
  customer_email_label: 'Email label',

  order_details_heading: 'Section heading',
  order_row1_label: 'Row 1 label',
  order_row1_qty_prefix: 'Row 1 quantity prefix',
  order_row2_label: 'Row 2 label',
  order_row2_note: 'Row 2 note',
  order_row3_label: 'Row 3 label',
  order_row3_url_prefix: 'Row 3 URL prefix',
  order_row4_label: 'Row 4 label',
  order_row4_login_prefix: 'Row 4 login prefix',
  order_checked_label: 'Checked & received label',
  order_checked_value: 'Checked & received value',
  order_yes: 'Text used for YES',
  order_no: 'Text used for NO',

  totals_subtotal_label: 'Sub total label',
  totals_total_label: 'Total label',

  notes_label: 'Notes label',

  terms_heading: 'Terms heading (bold text before the terms)',

  payment_details_label: 'Payment details label',
  payment_card_label: 'Card column heading',
  payment_cash_label: 'Cash column heading',
  payment_finance_label: 'Finance column heading',
  payment_ideal4finance_label: 'Ideal4Finance column heading',
  payment_subtotal_label: 'Sub total heading',
  payment_vat_label: 'VAT prefix (rate is added after)',
  payment_auth_code_label: 'Authorisation code label',
  payment_ideal4finance_ref_label: 'Ideal4Finance reference label',
  payment_total_label: 'Total label',
  ideal4finance_deposit_label: 'Ideal4Finance deposit row label',
  ideal4finance_amount_label: 'Ideal4Finance amount label',

  signature_customer_label: 'Customer signature label',
  signature_date_label: 'Date label',

  page2_customer_name_label: 'Customer name label',
  page2_date_label: 'Date label',
  page2_sign_here: 'Empty signature box placeholder',

  fin_doc_title: 'Document title',
  fin_doc_subtitle: 'Document subtitle',
  fin_date_label: 'Date label',
  fin_ref_label: 'Reference label',

  fin_section1_heading: 'Section 1 heading',
  fin_s1_name: 'Full name label',
  fin_s1_address: 'Address label',
  fin_s1_postcode: 'Postcode label',
  fin_s1_dob: 'Date of birth label',
  fin_s1_years: 'Years at address label',
  fin_s1_mobile: 'Mobile number label',

  fin_section2_heading: 'Section 2 heading',
  fin_s2_income: 'Monthly income label',
  fin_s2_priority: 'Priority outgoings label',
  fin_s2_other: 'Other outgoings label',
  fin_s2_disposable: 'Disposable balance label',
  fin_s2_expenditure: 'Total expenditure label',
  fin_s2_instalment: 'Agreed instalment label',

  fin_section3_heading: 'Section 3 heading',
  fin_s3_cash_price: 'Cash price label',
  fin_s3_deposit: 'Deposit label',
  fin_s3_credit: 'Amount of credit label',
  fin_s3_interest: 'Interest label',
  fin_s3_admin_fee: 'Admin fee label',
  fin_s3_total_charge: 'Total charge for credit label',
  fin_s3_total_payable: 'Total amount payable label',
  fin_s3_instalments: 'Number of instalments label',
  fin_s3_duration: 'Duration label',
  fin_s3_rate: 'Interest rate label',
  fin_s3_apr: 'APR label',

  fin_page2_title: 'Page 2 title',

  fin_section4_heading: 'Section 4 heading',
  fin_s4_frequency: 'Repayment frequency label',
  fin_s4_commencing: 'Commencing from label',
  fin_s4_monthly: 'Monthly repayment label',
  fin_s4_daily_rate: 'Daily interest rate label',

  fin_section5_heading: 'Section 5 heading',

  fin_section6_heading: 'Section 6 heading',
  fin_s6_creditor_label: 'Creditor label',
  fin_s6_trading_as_label: 'Trading as label',
  fin_s6_customer_agreement_label: 'Customer agreement label',
  fin_s6_customer_signature_label: 'Customer signature label',
  fin_s6_date_label: 'Date label',
  fin_s6_creditor_ack_label: 'Creditor acknowledgement label',
  fin_s6_creditor_signatory_label: 'Creditor signatory label'
};

const ContractEditor = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [previewHTML, setPreviewHTML] = useState('');
  const [previewMode, setPreviewMode] = useState('normal'); // 'normal' or 'finance'
  const editorPanelRef = useRef(null);
  const previewContainerRef = useRef(null);

  const [template, setTemplate] = useState({
    company_name: '',
    company_website: '',
    company_address: '',
    form_title: '',
    form_subtitle: '',
    form_contact_info: '',
    terms_and_conditions: '',
    signature_instruction: '',
    footer_line1: '',
    footer_line2: '',
    confirmation1_text: '',
    confirmation2_text: '',
    confirmation3_text: '',
    confirmation4_text: '',
    image_permission_text: '',
    image_no_permission_text: '',
    payment_details_html: '',
    // Finance section fields (dynamic - only shown when finance payment selected)
    finance_payment_label: '',
    non_finance_payment_label: '',
    finance_deposit_label: '',
    finance_amount_label: '',
    finance_provider_text: '',
    finance_info_text: '',
    // Payment section
    cash_initial_text: '',
    // Finance contract template fields
    creditor_trading_as: '',
    key_information_text: '',
    customer_agreement_text: '',
    creditor_acknowledgement_text: '',
    cca_notice: '',
    // Every other static label (headings, table labels, YES/NO...) keyed by name
    labels: {}
  });

  const [originalTemplate, setOriginalTemplate] = useState(null);

  // Section definitions with labels and field mappings
  const sections = {
    header: {
      label: 'Header & Company Info',
      fields: ['company_name', 'company_website', 'company_address'],
      page: 1
    },
    title: {
      label: 'Form Title & Instructions',
      fields: ['form_title', 'form_subtitle', 'form_contact_info'],
      page: 1
    },
    terms: {
      label: 'Terms and Conditions',
      fields: ['labels.terms_heading', 'terms_and_conditions'],
      page: 1
    },
    signature_instruction: {
      label: 'Signature Instruction',
      fields: ['signature_instruction'],
      page: 1
    },
    image_permission: {
      label: 'Image Permission Text',
      fields: ['image_permission_text', 'image_no_permission_text'],
      page: 1
    },
    footer: {
      label: 'Footer',
      fields: ['footer_line1', 'footer_line2'],
      page: 1
    },
    confirmation1: {
      label: 'Confirmation 1 - Not an Agency',
      fields: ['confirmation1_text'],
      page: 2
    },
    confirmation2: {
      label: 'Confirmation 2 - No Cancellation',
      fields: ['confirmation2_text'],
      page: 2
    },
    confirmation3: {
      label: 'Confirmation 3 - Pass Details',
      fields: ['confirmation3_text'],
      page: 2
    },
    confirmation4: {
      label: 'Confirmation 4 - Happy with Purchase',
      fields: ['confirmation4_text'],
      page: 2
    },
    finance: {
      label: 'Finance Payment Section',
      description: 'These labels appear only when Finance payment is selected',
      fields: ['finance_payment_label', 'non_finance_payment_label', 'finance_deposit_label', 'finance_amount_label', 'finance_provider_text', 'finance_info_text'],
      page: 1
    },
    payment: {
      label: 'Payment Section',
      fields: ['cash_initial_text'],
      page: 1
    },
    // --- Sections below are plain labels stored in the `labels` JSONB column ---
    info_row: {
      label: 'Reference Row (Customer / Studio / Photographer)',
      fields: ['labels.info_customer_no', 'labels.info_studio_no', 'labels.info_photographer', 'labels.info_invoice_no', 'labels.header_date_label'],
      page: 1
,
      normalOnly: true
    },
    customer_details: {
      label: 'Customer Details Labels',
      description: 'The grey field names in the customer details box',
      fields: [
        'labels.customer_details_heading',
        'labels.customer_name_label',
        'labels.customer_vip_label',
        'labels.customer_alt_name_label',
        'labels.customer_address_label',
        'labels.customer_postcode_label',
        'labels.customer_phone_label',
        'labels.customer_email_label'
      ],
      page: 1
,
      normalOnly: true
    },
    order_details: {
      label: 'Order Details Rows',
      description: 'Rename or repurpose each line of the order table',
      fields: [
        'labels.order_details_heading',
        'labels.order_row1_label',
        'labels.order_row1_qty_prefix',
        'labels.order_row2_label',
        'labels.order_row2_note',
        'labels.order_row3_label',
        'labels.order_row3_url_prefix',
        'labels.order_row4_label',
        'labels.order_row4_login_prefix',
        'labels.order_checked_label',
        'labels.order_checked_value',
        'labels.order_yes',
        'labels.order_no'
      ],
      page: 1
,
      normalOnly: true
    },
    totals: {
      label: 'Totals Box',
      fields: ['labels.totals_subtotal_label', 'labels.totals_total_label'],
      page: 1
,
      normalOnly: true
    },
    notes: {
      label: 'Notes Box',
      fields: ['labels.notes_label'],
      page: 1
,
      normalOnly: true
    },
    payment_headers: {
      label: 'Payment Table Labels',
      description: 'Column headings and row labels on the payment table',
      fields: [
        'labels.payment_details_label',
        'labels.payment_card_label',
        'labels.payment_cash_label',
        'labels.payment_finance_label',
        'labels.payment_ideal4finance_label',
        'labels.payment_subtotal_label',
        'labels.payment_vat_label',
        'labels.payment_auth_code_label',
        'labels.payment_ideal4finance_ref_label',
        'labels.payment_total_label',
        'labels.ideal4finance_deposit_label',
        'labels.ideal4finance_amount_label'
      ],
      page: 1
,
      normalOnly: true
    },
    signature_block: {
      label: 'Signature Box Labels',
      fields: ['labels.signature_customer_label', 'labels.signature_date_label'],
      page: 1
,
      normalOnly: true
    },
    page2_header: {
      label: 'Page 2 Header & Sign Boxes',
      fields: ['labels.page2_customer_name_label', 'labels.page2_date_label', 'labels.page2_sign_here'],
      page: 2
,
      normalOnly: true
    },
    // --- Finance agreement labels ---
    fin_header: {
      label: 'Finance - Document Title',
      fields: ['labels.fin_doc_title', 'labels.fin_doc_subtitle', 'labels.fin_date_label', 'labels.fin_ref_label'],
      page: 1,
      financeOnly: true
    },
    fin_section1: {
      label: 'Finance - Section 1 (Customer Information)',
      fields: [
        'labels.fin_section1_heading',
        'labels.fin_s1_name',
        'labels.fin_s1_address',
        'labels.fin_s1_postcode',
        'labels.fin_s1_dob',
        'labels.fin_s1_years',
        'labels.fin_s1_mobile'
      ],
      page: 1,
      financeOnly: true
    },
    fin_section2: {
      label: 'Finance - Section 2 (Affordability)',
      fields: [
        'labels.fin_section2_heading',
        'labels.fin_s2_income',
        'labels.fin_s2_priority',
        'labels.fin_s2_other',
        'labels.fin_s2_disposable',
        'labels.fin_s2_expenditure',
        'labels.fin_s2_instalment'
      ],
      page: 1,
      financeOnly: true
    },
    fin_section3: {
      label: 'Finance - Section 3 (Loan & Repayment)',
      fields: [
        'labels.fin_section3_heading',
        'labels.fin_s3_cash_price',
        'labels.fin_s3_deposit',
        'labels.fin_s3_credit',
        'labels.fin_s3_interest',
        'labels.fin_s3_admin_fee',
        'labels.fin_s3_total_charge',
        'labels.fin_s3_total_payable',
        'labels.fin_s3_instalments',
        'labels.fin_s3_duration',
        'labels.fin_s3_rate',
        'labels.fin_s3_apr'
      ],
      page: 1,
      financeOnly: true
    },
    fin_page2_header: {
      label: 'Finance - Page 2 Header',
      fields: ['labels.fin_page2_title'],
      page: 2,
      financeOnly: true
    },
    fin_section4: {
      label: 'Finance - Section 4 (Repayment Schedule)',
      fields: [
        'labels.fin_section4_heading',
        'labels.fin_s4_frequency',
        'labels.fin_s4_commencing',
        'labels.fin_s4_monthly',
        'labels.fin_s4_daily_rate'
      ],
      page: 2,
      financeOnly: true
    },
    fin_section6: {
      label: 'Finance - Section 6 (Execution Labels)',
      fields: [
        'labels.fin_section6_heading',
        'labels.fin_s6_creditor_label',
        'labels.fin_s6_trading_as_label',
        'labels.fin_s6_customer_agreement_label',
        'labels.fin_s6_customer_signature_label',
        'labels.fin_s6_date_label',
        'labels.fin_s6_creditor_ack_label',
        'labels.fin_s6_creditor_signatory_label'
      ],
      page: 2,
      financeOnly: true
    },
    // Finance contract template sections (only shown when finance preview is active)
    finance_creditor: {
      label: 'Finance - Creditor Info',
      description: 'Creditor details shown on the finance agreement',
      fields: ['creditor_trading_as'],
      page: 2,
      financeOnly: true
    },
    key_information: {
      label: 'Finance - Key Information',
      description: 'CCA 1974 key information text shown on page 2',
      fields: ['labels.fin_section5_heading', 'key_information_text'],
      page: 2,
      financeOnly: true
    },
    finance_agreements: {
      label: 'Finance - Agreement Texts',
      description: 'Customer agreement and creditor acknowledgement texts',
      fields: ['customer_agreement_text', 'creditor_acknowledgement_text'],
      page: 2,
      financeOnly: true
    },
    finance_cca: {
      label: 'Finance - CCA Notice',
      description: 'Consumer Credit Act notice',
      fields: ['cca_notice'],
      page: 2,
      financeOnly: true
    }
  };

  const fieldLabels = {
    company_name: 'Company Name',
    company_website: 'Website',
    company_address: 'Address',
    form_title: 'Form Title',
    form_subtitle: 'Subtitle',
    form_contact_info: 'Contact Info',
    terms_and_conditions: 'Terms & Conditions',
    signature_instruction: 'Signature Instruction',
    footer_line1: 'Footer Line 1',
    footer_line2: 'Footer Line 2',
    confirmation1_text: 'Confirmation Text',
    confirmation2_text: 'Confirmation Text',
    confirmation3_text: 'Confirmation Text',
    confirmation4_text: 'Confirmation Text',
    image_permission_text: 'Permission Granted',
    image_no_permission_text: 'Permission Denied',
    // Finance section labels
    finance_payment_label: 'Finance Payment Label (e.g., "DEPOSIT TODAY")',
    non_finance_payment_label: 'Non-Finance Payment Label (e.g., "PAYMENT TODAY")',
    finance_deposit_label: 'Deposit Row Label (e.g., "DEPOSIT PAID")',
    finance_amount_label: 'Finance Amount Label (e.g., "FINANCE AMOUNT")',
    finance_provider_text: 'Finance Provider Text (e.g., "FINANCE VIA IDEAL4FINANCE")',
    finance_info_text: 'Finance Info Text (e.g., "Complete docs before receipt")',
    // Payment section
    cash_initial_text: 'Cash Initial Text (viewer instruction for cash payments)',
    // Finance contract template fields
    creditor_trading_as: 'Trading As (company legal name)',
    key_information_text: 'Key Information & Acknowledgement Text',
    customer_agreement_text: 'Customer Agreement Text',
    creditor_acknowledgement_text: 'Creditor Acknowledgement Text',
    cca_notice: 'CCA 1974 Notice Text'
  };

  // Fetch actual contract HTML from server
  const fetchPreview = useCallback(async (mode = 'normal') => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contract-templates/preview?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPreviewHTML(data.html);
        setTemplate(data.template);
        setOriginalTemplate(data.template);
      }
    } catch (error) {
      console.error('Error fetching contract preview:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPreview(previewMode);
  }, []);

  // Refetch when preview mode changes
  useEffect(() => {
    fetchPreview(previewMode);
  }, [previewMode]);

  // Handle clicks on editable sections via event delegation
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const handleClick = (e) => {
      const editableEl = e.target.closest('[data-editable]');
      if (editableEl) {
        const sectionKey = editableEl.getAttribute('data-editable');
        if (sections[sectionKey]) {
          setActiveSection(sectionKey);
          setCurrentPage(sections[sectionKey].page);
        }
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [previewHTML]);

  // Close editor panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (editorPanelRef.current && !editorPanelRef.current.contains(event.target)) {
        const editableEl = event.target.closest('[data-editable]');
        if (!editableEl) {
          setActiveSection(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fields are either a top-level column ("form_title") or a plain label
  // stored in the JSONB column ("labels.order_yes").
  const isLabelField = (field) => field.startsWith('labels.');
  const labelKey = (field) => field.slice('labels.'.length);

  const getFieldValue = (field) => {
    if (isLabelField(field)) return (template.labels || {})[labelKey(field)] || '';
    return template[field] || '';
  };

  const getFieldName = (field) =>
    isLabelField(field)
      ? (LABEL_FIELD_NAMES[labelKey(field)] || labelKey(field))
      : (fieldLabels[field] || field);

  const handleChange = (field, value) => {
    if (isLabelField(field)) {
      const key = labelKey(field);
      setTemplate(prev => ({ ...prev, labels: { ...(prev.labels || {}), [key]: value } }));
    } else {
      setTemplate(prev => ({ ...prev, [field]: value }));
    }
    setHasChanges(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/contract-templates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(template)
      });
      if (response.ok) {
        const data = await response.json();
        setTemplate(data.template);
        setOriginalTemplate(data.template);
        setHasChanges(false);
        setSaveMessage({ type: 'success', text: 'Saved successfully!' });
        setTimeout(() => setSaveMessage(null), 3000);
        // Re-fetch the preview to show updated HTML
        await fetchPreview(previewMode);
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.message || 'Failed to save' });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Error saving template' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset to default template? This cannot be undone.')) return;
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/contract-templates/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTemplate(data.template);
        setOriginalTemplate(data.template);
        setHasChanges(false);
        setActiveSection(null);
        setSaveMessage({ type: 'success', text: 'Reset to defaults!' });
        setTimeout(() => setSaveMessage(null), 3000);
        // Re-fetch the preview
        await fetchPreview(previewMode);
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Error resetting template' });
    } finally {
      setSaving(false);
    }
  };

  // Extract pages from the HTML while preserving styles
  const getPageHTML = (pageNum) => {
    if (!previewHTML) return '';

    // Parse the HTML to get individual pages
    const parser = new DOMParser();
    const doc = parser.parseFromString(previewHTML, 'text/html');
    const pages = doc.querySelectorAll('.page');

    // Get styles from head
    const styles = doc.querySelector('style');
    const styleHTML = styles ? styles.outerHTML : '';

    if (pages.length >= pageNum) {
      // Return page with embedded styles
      return styleHTML + pages[pageNum - 1].outerHTML;
    }
    return '';
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 bg-gray-100 min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
          <p className="text-gray-600 mt-2">Only administrators can edit contract templates.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 bg-gray-100 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // CSS for editable section highlighting
  const editableStyles = `
    [data-editable] {
      cursor: pointer;
      transition: outline 0.2s, background-color 0.2s;
      border-radius: 4px;
    }
    [data-editable]:hover {
      outline: 2px solid #3b82f6;
      outline-offset: 4px;
      background-color: rgba(59, 130, 246, 0.05);
    }
    [data-editable].active {
      outline: 2px solid #2563eb;
      outline-offset: 4px;
      background-color: rgba(59, 130, 246, 0.1);
    }
  `;

  return (
    <div className="h-[calc(100vh-80px)] bg-gray-900 flex flex-col overflow-hidden">
      <style>{editableStyles}</style>

      {/* Top Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-semibold text-lg">Contract Editor</h1>
          <div className="h-6 w-px bg-gray-600" />
          <div className="flex items-center gap-2 bg-gray-700 rounded-lg px-2 py-1">
            <button
              onClick={() => setCurrentPage(1)}
              className={`px-3 py-1 rounded text-sm transition-colors ${currentPage === 1 ? 'bg-blue-500 text-white' : 'text-gray-300 hover:text-white'}`}
            >
              Page 1
            </button>
            <button
              onClick={() => setCurrentPage(2)}
              className={`px-3 py-1 rounded text-sm transition-colors ${currentPage === 2 ? 'bg-blue-500 text-white' : 'text-gray-300 hover:text-white'}`}
            >
              Page 2
            </button>
          </div>
          <div className="flex items-center gap-1 bg-gray-700 rounded-lg px-2 py-1">
            <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="text-gray-300 hover:text-white p-1">
              <FiZoomOut size={16} />
            </button>
            <span className="text-gray-300 text-sm w-12 text-center">{zoom}%</span>
            <button onClick={() => setZoom(Math.min(150, zoom + 10))} className="text-gray-300 hover:text-white p-1">
              <FiZoomIn size={16} />
            </button>
          </div>
          <div className="text-xs text-gray-400 ml-2">
            Click highlighted sections to edit
          </div>
          <div className="h-6 w-px bg-gray-600 ml-2" />
          <select
            value={activeSection || ''}
            onChange={(e) => {
              if (e.target.value) {
                setActiveSection(e.target.value);
                setCurrentPage(sections[e.target.value].page);
              }
            }}
            className="bg-gray-700 text-gray-300 text-sm rounded px-2 py-1 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Jump to section...</option>
            <optgroup label="Page 1">
              {Object.entries(sections).filter(([_, s]) => s.page === 1 && (previewMode === 'finance' ? !s.normalOnly : !s.financeOnly)).map(([key, section]) => (
                <option key={key} value={key}>{section.label}</option>
              ))}
            </optgroup>
            <optgroup label="Page 2">
              {Object.entries(sections).filter(([_, s]) => s.page === 2 && (previewMode === 'finance' ? !s.normalOnly : !s.financeOnly)).map(([key, section]) => (
                <option key={key} value={key}>{section.label}</option>
              ))}
            </optgroup>
          </select>
          <div className="h-6 w-px bg-gray-600 ml-2" />
          {/* Preview Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-700 rounded-lg px-1 py-1">
            <button
              onClick={() => setPreviewMode('normal')}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                previewMode === 'normal'
                  ? 'bg-green-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => setPreviewMode('finance')}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                previewMode === 'finance'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Finance
            </button>
            <button
              onClick={() => setPreviewMode('ideal4finance')}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                previewMode === 'ideal4finance'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Ideal4Finance
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm ${
              saveMessage.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {saveMessage.type === 'success' ? <FiCheck size={14} /> : <FiX size={14} />}
              {saveMessage.text}
            </div>
          )}
          {hasChanges && (
            <span className="text-yellow-400 text-sm">Unsaved changes</span>
          )}
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <FiRefreshCw size={14} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
              hasChanges ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <FiSave size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Contract Preview */}
        <div
          className="flex-1 overflow-auto p-8 bg-gray-900"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #374151 1px, transparent 0)', backgroundSize: '20px 20px' }}
        >
          <div className="flex items-center justify-center min-h-full">
            <div
              ref={previewContainerRef}
              className="bg-white shadow-2xl transition-transform origin-top"
              style={{
                transform: `scale(${zoom / 100})`,
                width: '210mm',
                minHeight: '297mm'
              }}
              dangerouslySetInnerHTML={{ __html: getPageHTML(currentPage) }}
            />
          </div>
        </div>

        {/* Editor Panel (slides in from right) */}
        <div
          ref={editorPanelRef}
          className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col ${activeSection ? 'w-96' : 'w-0'}`}
          style={{ overflow: 'hidden' }}
        >
          {activeSection && sections[activeSection] && (
            <div className="flex flex-col h-full">
              {/* Panel Header */}
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div>
                  <h3 className="font-semibold text-gray-900">{sections[activeSection].label}</h3>
                  <p className="text-xs text-gray-500">Click outside to close</p>
                </div>
                <button
                  onClick={() => setActiveSection(null)}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  <FiX size={18} />
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {sections[activeSection].description && (
                  <p className="text-xs text-gray-500 -mt-1">{sections[activeSection].description}</p>
                )}
                {sections[activeSection].fields.map(field => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {getFieldName(field)}
                    </label>
                    {isLabelField(field) ? (
                      <input
                        type="text"
                        value={getFieldValue(field)}
                        onChange={(e) => handleChange(field, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${getFieldName(field).toLowerCase()}...`}
                      />
                    ) : field === 'terms_and_conditions' || field === 'key_information_text' ? (
                      <RichTextEditor
                        value={template[field] || ''}
                        onChange={(val) => handleChange(field, val)}
                        rows={12}
                        placeholder={`Enter ${getFieldName(field).toLowerCase()}...`}
                        showFontSize={true}
                      />
                    ) : field.startsWith('confirmation') || field === 'signature_instruction' || field === 'customer_agreement_text' || field === 'creditor_acknowledgement_text' || field === 'cca_notice' ? (
                      <RichTextEditor
                        value={template[field] || ''}
                        onChange={(val) => handleChange(field, val)}
                        rows={4}
                        placeholder={`Enter ${getFieldName(field).toLowerCase()}...`}
                        showFontSize={true}
                      />
                    ) : field === 'image_permission_text' || field === 'image_no_permission_text' ? (
                      <RichTextEditor
                        value={template[field] || ''}
                        onChange={(val) => handleChange(field, val)}
                        rows={2}
                        placeholder={`Enter ${getFieldName(field).toLowerCase()}...`}
                        showFontSize={false}
                      />
                    ) : (
                      <input
                        type="text"
                        value={template[field] || ''}
                        onChange={(e) => handleChange(field, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${getFieldName(field).toLowerCase()}...`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Panel Footer */}
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    hasChanges ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <FiSave size={14} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page Navigation (bottom) */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center justify-center gap-4 flex-shrink-0">
        <button
          onClick={() => setCurrentPage(1)}
          disabled={currentPage === 1}
          className={`p-2 rounded transition-colors ${currentPage === 1 ? 'text-gray-600' : 'text-gray-300 hover:text-white hover:bg-gray-700'}`}
        >
          <FiChevronLeft size={20} />
        </button>
        <span className="text-gray-300 text-sm">Page {currentPage} of 2</span>
        <button
          onClick={() => setCurrentPage(2)}
          disabled={currentPage === 2}
          className={`p-2 rounded transition-colors ${currentPage === 2 ? 'text-gray-600' : 'text-gray-300 hover:text-white hover:bg-gray-700'}`}
        >
          <FiChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default ContractEditor;
