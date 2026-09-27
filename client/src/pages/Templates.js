import React, { useState, useEffect, useRef } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiEye, FiSend, FiMail, FiPhone, FiSettings, FiSave, FiX, FiExternalLink } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

const Templates = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState('');
  const [variables, setVariables] = useState([]);
  const [emailAccounts, setEmailAccounts] = useState([]);
  
  // Refs to track which field is focused for variable insertion
  const emailBodyRef = useRef(null);
  const smsBodyRef = useRef(null);
  const subjectRef = useRef(null);
  const lastFocusedFieldRef = useRef(null); // Track the last focused field

  const [formData, setFormData] = useState({
    name: '',
    type: user?.role === 'admin' ? 'booking_confirmation' : 'custom',
    subject: '',
    emailBody: '',
    smsBody: '',
    reminderDays: 5,
    sendEmail: true,
    sendSMS: true,
    isActive: true,
    emailAccount: '', // Empty = use user's assigned account
    attachments: []
  });

  // Utility to group templates by category
  const categorizeTemplates = (templates, userRole) => {
    if (!templates || !Array.isArray(templates)) {
      return { 'Diary Templates': [], 'Sale Templates': [], 'Lead Details Templates': [] };
    }

    const isBooker = userRole !== 'admin';

    const categories = {
      'Diary Templates': ['booking_confirmation', 'booking_link', 'reschedule', 'cancellation', 'secondary_confirmation'],
      'Bookers Templates': ['no_answer', 'no_photo', 'invitation_email'], // Templates created by booker role users
      'Sale Templates': ['sale_confirmation', 'sale_followup', 'sale', 'sale_notification', 'sale_paid_in_full', 'sale_followup_paid', 'sale_finance_agreement', 'sale_followup_finance', 'contract_signing', 'contract_delivery'],
      'Receipts': ['receipt', 'sale_receipt', 'payment_receipt'],
      'Lead Details Templates': ['custom', 'booker']
    };
    const grouped = { 'Diary Templates': [], 'Bookers Templates': [], 'Sale Templates': [], 'Receipts': [], 'Lead Details Templates': [] };
    templates.forEach(t => {
      let found = false;
      for (const [cat, types] of Object.entries(categories)) {
        if (types.includes(t.type)) {
          grouped[cat].push(t);
          found = true;
          break;
        }
      }
      if (!found) grouped['Diary Templates'].push(t); // fallback to Diary Templates
    });

    // Remove Diary Templates and Bookers Templates for booker users (admin should see all)
    if (isBooker) {
      delete grouped['Diary Templates'];
      delete grouped['Bookers Templates']; // Bookers use their own BookersTemplates.js page
    }

    return grouped;
  };

  // Category filter state, set from navigation
  const [categoryFilter, setCategoryFilter] = useState(location.state?.category || 'All');
  useEffect(() => {
    if (location.state?.category) {
      setCategoryFilter(location.state.category);
    }
  }, [location.state?.category]);

  useEffect(() => {
    fetchTemplates();
    fetchVariables();
    fetchEmailAccounts();
    if (user?.role === 'admin') {
      fetchLeads();
    }
  }, [user]);

  // Fetch type-specific variables when template type changes in form
  useEffect(() => {
    if (showModal && formData.type) {
      fetchVariables(formData.type);
    }
  }, [formData.type, showModal]);

  const fetchTemplates = async () => {
    try {
      console.log('🔄 Fetching templates...');
      const response = await fetch('/api/templates', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      if (response.ok) {
        const data = await response.json();
        console.log('📥 Fetched templates:', data.length, 'templates');
        setTemplates(data);
      } else {
        console.error('❌ Failed to fetch templates:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailAccounts = async () => {
    try {
      const response = await fetch('/api/email-accounts/dropdown', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setEmailAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching email accounts:', error);
    }
  };

  const fetchVariables = async (templateType = null) => {
    try {
      const typeParam = templateType ? `?type=${templateType}` : '';
      const response = await fetch(`/api/templates/variables/list${typeParam}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setVariables(data);
      }
    } catch (error) {
      console.error('Error fetching variables:', error);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await fetch('/api/leads?limit=100', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const url = editingTemplate
        ? `/api/templates/${editingTemplate._id}`
        : '/api/templates';

      const method = editingTemplate ? 'PUT' : 'POST';

      console.log('📤 Sending template data:', {
        url,
        method,
        templateId: editingTemplate?._id,
        formData: { ...formData, emailBody: formData.emailBody?.substring(0, 50) + '...', smsBody: formData.smsBody?.substring(0, 50) + '...' }
      });

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const savedTemplate = await response.json();
        console.log('✅ Template saved successfully. Response:', {
          id: savedTemplate._id || savedTemplate.id,
          name: savedTemplate.name,
          type: savedTemplate.type
        });
        setShowModal(false);
        setEditingTemplate(null);
        resetForm();
        await fetchTemplates();

        // Show success message
        alert('Template saved successfully! Changes will be applied to future messages.');
      } else {
        const error = await response.json();
        console.error('❌ Save failed:', error);
        alert(error.message || 'Error saving template');
      }
    } catch (error) {
      console.error('❌ Error saving template:', error);
      alert('Error saving template');
    }
  };

  const handleEdit = async (template) => {
    setEditingTemplate(template);
    
    // Load existing attachments data from the database
    let existingAttachments = [];
    if (template._id) {
      try {
        const response = await fetch(`/api/templates/${template._id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const templateData = await response.json();
          if (templateData.attachments) {
            try {
              existingAttachments = JSON.parse(templateData.attachments);
            } catch (e) {
              console.warn('Failed to parse attachments:', e);
            }
          }
        }
      } catch (error) {
        console.error('Error loading template attachments:', error);
      }
    }
    
    setFormData({
      name: template.name,
      type: template.type,
      subject: template.subject,
      emailBody: template.emailBody,
      smsBody: template.smsBody,
      reminderDays: template.reminderDays || 5,
      sendEmail: template.sendEmail,
      sendSMS: template.sendSMS,
      isActive: template.isActive,
      emailAccount: template.email_account || template.emailAccount || '', // Empty = use user's assigned account
      attachments: Array.isArray(existingAttachments) ? existingAttachments : []
    });
    setShowModal(true);
  };

  const handleDelete = async (templateId) => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        fetchTemplates();
      } else {
        const error = await response.json();
        alert(error.message || 'Error deleting template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error deleting template');
    }
  };

  const handlePreview = (template) => {
    // Directly use template data for preview - no API call needed
    setPreviewData({
      template: {
        name: template.name,
        type: template.type,
        subject: template.subject,
        emailBody: template.emailBody || template.email_body,
        smsBody: template.smsBody || template.sms_body,
        sendEmail: template.sendEmail || template.send_email,
        sendSMS: template.sendSMS || template.send_sms
      }
    });
    setShowPreview(true);
  };

  const handleTest = async (template) => {
    if (!selectedLead) {
      alert('Please select a lead to test with');
      return;
    }

    try {
      const response = await fetch(`/api/templates/${template._id}/test/${selectedLead}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        alert('Test message sent successfully!');
      } else {
        const error = await response.json();
        alert(error.message || 'Error sending test message');
      }
    } catch (error) {
      console.error('Error testing template:', error);
      alert('Error sending test message');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: user?.role === 'admin' ? 'booking_confirmation' : 'custom',
      subject: '',
      emailBody: '',
      smsBody: '',
      reminderDays: 5,
      sendEmail: true,
      sendSMS: true,
      isActive: true,
      emailAccount: '', // Empty = use user's assigned account
      attachments: []
    });
  };

  const insertVariable = (variable) => {
    // Determine which field to insert into
    let targetField = null;
    let fieldName = null;
    
    // First, check if any field is currently focused
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      targetField = activeElement;
      fieldName = activeElement.name;
    } 
    // Otherwise, use the last focused field
    else if (lastFocusedFieldRef.current) {
      targetField = lastFocusedFieldRef.current;
      fieldName = targetField.name;
    }
    // If no field was ever focused, default to emailBody if enabled, otherwise smsBody
    else {
      if (formData.sendEmail && emailBodyRef.current) {
        targetField = emailBodyRef.current;
        fieldName = 'emailBody';
      } else if (formData.sendSMS && smsBodyRef.current) {
        targetField = smsBodyRef.current;
        fieldName = 'smsBody';
      }
    }
    
    if (!targetField || !fieldName) {
      // If no valid field found, focus on emailBody or smsBody as fallback
      if (formData.sendEmail && emailBodyRef.current) {
        emailBodyRef.current.focus();
        targetField = emailBodyRef.current;
        fieldName = 'emailBody';
      } else if (formData.sendSMS && smsBodyRef.current) {
        smsBodyRef.current.focus();
        targetField = smsBodyRef.current;
        fieldName = 'smsBody';
      } else {
        console.warn('No target field available for variable insertion');
        return;
      }
    }
    
    // Get cursor position
    const start = targetField.selectionStart || 0;
    const end = targetField.selectionEnd || 0;
    const currentValue = formData[fieldName] || '';
    
    // Insert variable at cursor position
    const newText = currentValue.substring(0, start) + variable + currentValue.substring(end);
    
    // Update form data
    setFormData(prev => ({
      ...prev,
      [fieldName]: newText
    }));
    
    // Update cursor position after state update
    setTimeout(() => {
      targetField.focus();
      const newCursorPos = start + variable.length;
      targetField.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };
  
  // Track when fields are focused
  const handleFieldFocus = (fieldName, ref) => {
    lastFocusedFieldRef.current = ref.current;
  };

  // Bookers can access but with limited functionality
  const isBooker = user?.role !== 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Message Templates</h1>
              <p className="text-gray-600 mt-2">Manage email and SMS templates for automatic messaging</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/bookers-templates')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700"
                title="Manage templates for Lead Details"
              >
                <FiExternalLink /> Bookers Templates
              </button>
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  resetForm();
                  setShowModal(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
              >
                <FiPlus /> New Template
              </button>
            </div>
          </div>
        </div>
        {/* Templates Grid */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        ) : (
          !loading && (() => {
            // Filter templates: bookers only see their own, and exclude diary templates
            // ADMIN sees ALL templates including diary templates
            let availableTemplates = templates || [];
            if (isBooker) {
              // Bookers only see their own templates
              availableTemplates = availableTemplates.filter(t => t.user_id === user?.id);
              // Exclude diary templates for bookers
              const diaryTypes = ['booking_confirmation', 'reschedule', 'cancellation'];
              availableTemplates = availableTemplates.filter(t => !diaryTypes.includes(t.type));
            }
            // Admin sees all templates (no filtering needed)
            
            const filteredTemplates = categoryFilter === 'All' ? availableTemplates : availableTemplates.filter(t => {
              const cat = Object.entries({
                'Diary Templates': ['booking_confirmation', 'booking_link', 'reschedule', 'cancellation', 'secondary_confirmation'],
                'Bookers Templates': ['no_answer', 'no_photo', 'invitation_email'],
                'Sale Templates': ['sale_confirmation', 'sale_followup', 'sale', 'sale_notification', 'sale_paid_in_full', 'sale_followup_paid', 'sale_finance_agreement', 'sale_followup_finance', 'contract_signing', 'contract_delivery'],
                'Lead Details Templates': ['custom', 'booker']
              }).find(([cat, types]) => types.includes(t.type));
              return cat ? cat[0] === categoryFilter : categoryFilter === 'Diary Templates';
            });

            const categorized = categorizeTemplates(filteredTemplates, user?.role);

            return Object.entries(categorized).map(([cat, group]) =>
              group && group.length > 0 && (
                <div key={cat} className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{cat}</h2>
                    {cat === 'Lead Details Templates' && (
                      <button
                        onClick={() => navigate('/bookers-templates')}
                        className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                      >
                        <FiExternalLink className="h-4 w-4" />
                        Manage in Bookers Templates
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {group.map(template => (
                      <div key={`template-${template._id}`} className="bg-white rounded-lg shadow p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                            <p className="text-sm text-gray-500 capitalize">{template.type.replace('_', ' ')}</p>
                            {/* Show booker name for admin viewing Bookers Templates */}
                            {template.creator?.name && cat === 'Bookers Templates' && (
                              <p className="text-xs text-blue-600 mt-1">
                                <span className="font-medium">By:</span> {template.creator.name}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {template.sendEmail && <FiMail className="text-blue-500" />}
                            {template.sendSMS && <FiPhone className="text-green-500" />}
                            {template.attachments && (() => {
                              try {
                                const attachments = JSON.parse(template.attachments);
                                return Array.isArray(attachments) && attachments.length > 0 && (
                                  <div className="flex items-center gap-1 text-purple-600" title={`${attachments.length} attachment(s)`}>
                                    <span className="text-xs">📎</span>
                                    <span className="text-xs font-medium">{attachments.length}</span>
                                  </div>
                                );
                              } catch (e) {
                                return null;
                              }
                            })()}
                          </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-sm text-gray-600 line-clamp-2">{template.subject}</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              template.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {template.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePreview(template)}
                              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Preview"
                            >
                              <FiEye />
                            </button>
                            <button
                              onClick={() => handleEdit(template)}
                              className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                              title="Edit"
                            >
                              <FiEdit />
                            </button>
                            <button
                              onClick={() => handleDelete(template._id)}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </div>

                        {user?.role === 'admin' && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center gap-2 mt-2">
                              <select
                                value={selectedLead}
                                onChange={(e) => setSelectedLead(e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-xs max-w-xs w-48 focus:ring-1 focus:ring-purple-400"
                                style={{ minWidth: 0 }}
                              >
                                <option key="select-lead-placeholder" value="">Select lead to test...</option>
                                {(leads || []).map((lead, index) => (
                                  <option key={`lead-${lead.id || index}`} value={lead.id}>
                                    {lead.name} ({lead.email})
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleTest(template)}
                                disabled={!selectedLead}
                                className="px-2 py-1 bg-purple-600 text-white rounded text-xs flex items-center gap-1 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Send test message"
                                style={{ minWidth: 0 }}
                              >
                                <FiSend size={14} /> Test
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            );
          })()
        )}

        {/* Beautiful Template Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
            <div className="relative top-5 mx-auto p-0 border-0 w-full max-w-6xl shadow-2xl rounded-2xl bg-white overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold">
                      {editingTemplate ? 'Edit Template' : 'Create New Template'}
                    </h3>
                    <p className="text-blue-100 mt-1">
                      {editingTemplate ? 'Update your message template' : 'Design beautiful messages for your CRM'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-white hover:text-blue-200 p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-all"
                  >
                    <FiX className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  {/* Left Panel - Template Settings */}
                  <div className="xl:col-span-1">
                    <div className="bg-gray-50 rounded-xl p-6 h-fit">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FiSettings className="text-blue-600" />
                        Template Settings
                      </h4>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Template Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            placeholder="Enter template name"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Template Type <span className="text-red-500">*</span>
                          </label>
                          <select
                            name="type"
                            value={formData.type}
                            onChange={(e) => setFormData({...formData, type: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            required
                          >
                            {!isBooker && (
                              <>
                                <option key="booking_confirmation" value="booking_confirmation">📅 Booking Confirmation</option>
                                <option key="booking_link" value="booking_link">🔗 Booking Link</option>
                                <option key="secondary_confirmation" value="secondary_confirmation">📋 Secondary Confirmation</option>
                                <option key="reschedule" value="reschedule">🔄 Reschedule</option>
                                <option key="cancellation" value="cancellation">🚫 Cancellation</option>
                              </>
                            )}
                            <option key="sale_confirmation" value="sale_confirmation">💰 Sale Confirmation</option>
                            <option key="sale_followup" value="sale_followup">📞 Sale Follow-up</option>
                            <option key="sale_paid_in_full" value="sale_paid_in_full">🎉 Paid in Full - Welcome</option>
                            <option key="sale_followup_paid" value="sale_followup_paid">✅ Paid in Full - Follow-up</option>
                            <option key="sale_finance_agreement" value="sale_finance_agreement">📋 Finance Agreement - Welcome</option>
                            <option key="sale_followup_finance" value="sale_followup_finance">💳 Finance Agreement - Follow-up</option>
                            <option key="contract_signing" value="contract_signing">📝 Contract Signing</option>
                            <option key="contract_delivery" value="contract_delivery">📦 Contract Delivery (Photos + PDF)</option>
                            <option key="receipt" value="receipt">🧾 Receipt</option>
                            <option key="sale_receipt" value="sale_receipt">🧾 Sale Receipt</option>
                            <option key="payment_receipt" value="payment_receipt">🧾 Payment Receipt</option>
                            <option key="custom" value="custom">📝 Custom Template</option>
                            <option key="booker" value="booker">👤 Booker Template</option>
                          </select>
                        </div>


                        {/* Toggle Switches */}
                        <div className="space-y-3">
                          <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-all">
                            <div className="flex items-center">
                              <FiMail className="text-blue-600 mr-3" />
                              <span className="font-medium">Send Email</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={formData.sendEmail}
                              onChange={(e) => setFormData({...formData, sendEmail: e.target.checked})}
                              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                            />
                          </label>
                          
                          <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-all">
                            <div className="flex items-center">
                              <FiPhone className="text-green-600 mr-3" />
                              <span className="font-medium">Send SMS</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={formData.sendSMS}
                              onChange={(e) => setFormData({...formData, sendSMS: e.target.checked})}
                              className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                            />
                          </label>
                          
                          <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-all">
                            <div className="flex items-center">
                              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                              <span className="font-medium">Active</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={formData.isActive}
                              onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                              className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                            />
                          </label>

                          {/* Email Account Selector */}
                          {formData.sendEmail && (
                            <div className="p-3 bg-white rounded-lg border border-gray-200">
                              <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Email Account
                              </label>
                              <select
                                value={formData.emailAccount}
                                onChange={(e) => setFormData({...formData, emailAccount: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                              >
                                <option value="">👤 Use User's Assigned Account (Recommended)</option>
                                {emailAccounts.filter(a => a.isEnvVar).length > 0 && (
                                  <optgroup label="Email Accounts">
                                    {emailAccounts.filter(a => a.isEnvVar).map(account => (
                                      <option key={account.id} value={account.id}>
                                        📧 {account.name} ({account.email})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {emailAccounts.filter(a => !a.isEnvVar).length > 0 && (
                                  <optgroup label="Database Accounts">
                                    {emailAccounts.filter(a => !a.isEnvVar).map(account => (
                                      <option key={account.id} value={account.id}>
                                        📧 {account.name} ({account.email}){account.is_default ? ' ⭐' : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                              <p className="text-xs text-gray-500 mt-1">
                                {formData.emailAccount === ''
                                  ? "Email will be sent from the account assigned to the user sending it"
                                  : "Email will always be sent from the selected account"
                                }
                              </p>
                            </div>
                          )}

                          {/* Attachments */}
                          <div className="p-4 bg-white rounded-lg border border-gray-200">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-4 h-4 bg-purple-500 rounded"></div>
                              <span className="font-medium">Email Attachments</span>
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                                {(Array.isArray(formData.attachments) ? formData.attachments : []).length} files
                              </span>
                            </div>
                            
                            {/* File Upload */}
                            <div className="mb-3">
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.csv,.xlsx,.xls,.txt"
                                onChange={async (e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (files.length === 0) return;
                                  
                                  // Show loading indicator
                                  const uploadButton = e.target.nextElementSibling;
                                  if (uploadButton) uploadButton.textContent = 'Uploading...';
                                  
                                  const uploaded = [];
                                  for (const file of files) {
                                    try {
                                      const fd = new FormData();
                                      fd.append('file', file);
                                      const resp = await fetch(`/api/templates/${editingTemplate?._id || 'new'}/attachments`, {
                                        method: 'POST',
                                        headers: {
                                          'Authorization': `Bearer ${localStorage.getItem('token')}`
                                        },
                                        body: fd
                                      });
                                      if (resp.ok) {
                                        const data = await resp.json();
                                        uploaded.push(data);
                                      } else {
                                        console.error('Upload failed for:', file.name);
                                      }
                                    } catch (error) {
                                      console.error('Upload error for:', file.name, error);
                                    }
                                  }
                                  
                                  setFormData(prev => ({
                                    ...prev,
                                    attachments: Array.isArray(prev.attachments) ? [...prev.attachments, ...uploaded] : uploaded
                                  }));
                                  
                                  // Reset upload button
                                  if (uploadButton) uploadButton.textContent = 'Choose Files';
                                  e.target.value = ''; // Reset input
                                }}
                                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                id="attachment-upload"
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                Supported: PDF, Word, Images, CSV, Excel files (max 25MB per file)
                              </div>
                            </div>
                            
                            {/* Attachment List */}
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {(Array.isArray(formData.attachments) ? formData.attachments : []).map((a, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                      {a.mimetype?.includes('pdf') ? '📄' : 
                                       a.mimetype?.includes('word') || a.mimetype?.includes('document') ? '📝' : 
                                       a.mimetype?.includes('image') ? '🖼️' : 
                                       a.mimetype?.includes('spreadsheet') || a.mimetype?.includes('excel') ? '📊' :
                                       '📎'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm truncate" title={a.originalName || a.filename}>
                                        {a.originalName || a.filename}
                                      </div>
                                      <div className="text-xs text-gray-500 flex items-center gap-2">
                                        <span>{a.size ? `${(a.size / 1024 / 1024).toFixed(1)} MB` : 'Unknown size'}</span>
                                        {a.mimetype && (
                                          <span className="bg-gray-200 px-1 rounded text-xs">
                                            {a.mimetype.split('/')[1]?.toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <a 
                                      href={a.url} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                      title="Download/View"
                                    >
                                      View
                                    </a>
                                    <button 
                                      type="button" 
                                      className="text-red-600 hover:text-red-800 text-xs font-medium" 
                                      onClick={() => {
                                        if (window.confirm('Remove this attachment?')) {
                                          setFormData(prev => ({
                                            ...prev,
                                            attachments: (Array.isArray(prev.attachments) ? prev.attachments : [])
                                              .filter((_, i) => i !== idx)
                                          }));
                                        }
                                      }}
                                      title="Remove attachment"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                              
                              {(!formData.attachments || formData.attachments.length === 0) && (
                                <div className="text-center py-6 text-gray-500">
                                  <div className="text-2xl mb-2">📎</div>
                                  <div className="text-sm">No attachments yet</div>
                                  <div className="text-xs">Files will be sent with every email</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Variables */}
                      <div className="mt-6">
                        <h5 className="text-sm font-semibold text-gray-700 mb-3">Available Variables</h5>
                        <div className="bg-white rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
                          <div className="p-3">
                            {variables.map((variable) => (
                              <button
                                key={`variable-${variable.name}`}
                                type="button"
                                onClick={() => insertVariable(variable.name)}
                                className="w-full text-left p-2 hover:bg-blue-50 rounded text-sm transition-all group"
                                title={variable.description}
                              >
                                <div className="font-mono text-blue-600 group-hover:text-blue-700">{variable.name}</div>
                                <div className="text-gray-500 text-xs">{variable.description}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Panel - Content Editor */}
                  <div className="xl:col-span-2 space-y-6">
                    {/* Email Content */}
                    {formData.sendEmail && (
                      <div className="bg-white border border-gray-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FiMail className="text-blue-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">Email Content</h3>
                            <p className="text-sm text-gray-500">Design your email message</p>
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Subject Line
                            </label>
                            <input
                              ref={subjectRef}
                              name="subject"
                              type="text"
                              value={formData.subject}
                              onChange={(e) => setFormData({...formData, subject: e.target.value})}
                              onFocus={() => handleFieldFocus('subject', subjectRef)}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                              placeholder="Enter email subject"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Email Body
                            </label>
                            <textarea
                              ref={emailBodyRef}
                              name="emailBody"
                              value={formData.emailBody}
                              onChange={(e) => setFormData({...formData, emailBody: e.target.value})}
                              onFocus={() => handleFieldFocus('emailBody', emailBodyRef)}
                              rows={12}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm transition-all resize-none"
                              placeholder="Write your email content here..."
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SMS Content */}
                    {formData.sendSMS && (
                      <div className="bg-white border border-gray-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <FiPhone className="text-green-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">SMS Content</h3>
                            <p className="text-sm text-gray-500">Design your SMS message</p>
                          </div>
                        </div>
                        
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              SMS Message
                            </label>
                            <textarea
                              ref={smsBodyRef}
                              name="smsBody"
                              value={formData.smsBody}
                              onChange={(e) => setFormData({...formData, smsBody: e.target.value})}
                              onFocus={() => handleFieldFocus('smsBody', smsBodyRef)}
                              rows={6}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm transition-all resize-none"
                              placeholder="Write your SMS content here..."
                              required
                            />
                          <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-gray-500">
                              Character count: <span className={`font-semibold ${(formData.smsBody || '').length > 160 ? 'text-red-500' : 'text-green-600'}`}>
                                {(formData.smsBody || '').length}/160
                              </span>
                            </p>
                            <div className="text-xs text-gray-400">
                              {Math.ceil((formData.smsBody || '').length / 160)} message(s)
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Preview Section */}
                    {(formData.emailBody || formData.smsBody) && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">Live Preview</h4>
                        <div className="space-y-4">
                          {formData.emailBody && (
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <div className="text-sm font-semibold text-gray-600 p-3 bg-gray-50 border-b flex items-center justify-between">
                                <span>Email Preview:</span>
                                <span className="text-xs text-gray-400">Rendered HTML</span>
                              </div>
                              {/* Check if content looks like HTML */}
                              {formData.emailBody.includes('<') && formData.emailBody.includes('>') ? (
                                <div className="p-4">
                                  <iframe
                                    title="Email Preview"
                                    srcDoc={formData.emailBody}
                                    className="w-full border-0 rounded"
                                    style={{ minHeight: '400px', maxHeight: '600px' }}
                                    sandbox="allow-same-origin"
                                  />
                                </div>
                              ) : (
                                <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap">
                                  {formData.emailBody}
                                </div>
                              )}
                            </div>
                          )}
                          {formData.smsBody && (
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <div className="text-sm font-semibold text-gray-600 p-3 bg-gray-50 border-b">
                                SMS Preview:
                              </div>
                              <div className="p-4">
                                {/* SMS Phone mockup */}
                                <div className="max-w-xs mx-auto bg-gray-100 rounded-2xl p-4">
                                  <div className="bg-green-500 text-white rounded-2xl rounded-br-sm p-3 text-sm">
                                    {formData.smsBody}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-8 flex justify-end gap-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-medium flex items-center gap-2 shadow-lg"
                  >
                    <FiSave className="w-4 h-4" />
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreview && previewData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">Template Preview</h2>
                    <p className="text-blue-100 mt-1">{previewData.template.name} - {previewData.template.type?.replace('_', ' ')}</p>
                  </div>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-white hover:text-blue-200 p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-all"
                  >
                    <FiX className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
                <div className="space-y-6">
                  {/* Email Preview */}
                  {(previewData.template.sendEmail !== false && previewData.template.emailBody) && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
                        <FiMail className="text-blue-600" />
                        <span className="font-semibold text-gray-700">Email Preview</span>
                      </div>

                      {/* Subject */}
                      <div className="px-4 py-3 bg-gray-50 border-b">
                        <span className="text-sm text-gray-500">Subject:</span>
                        <span className="ml-2 font-medium">{previewData.template.subject || '(No subject)'}</span>
                      </div>

                      {/* Email Body - Rendered HTML */}
                      <div className="p-4 bg-white">
                        {previewData.template.emailBody?.includes('<') && previewData.template.emailBody?.includes('>') ? (
                          <iframe
                            title="Email Preview"
                            srcDoc={previewData.template.emailBody}
                            className="w-full border border-gray-200 rounded-lg"
                            style={{ minHeight: '400px', maxHeight: '500px' }}
                            sandbox="allow-same-origin"
                          />
                        ) : (
                          <div className="whitespace-pre-wrap text-sm text-gray-800 p-4 bg-gray-50 rounded-lg">
                            {previewData.template.emailBody || '(No email content)'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SMS Preview */}
                  {(previewData.template.sendSMS !== false && previewData.template.smsBody) && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
                        <FiPhone className="text-green-600" />
                        <span className="font-semibold text-gray-700">SMS Preview</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {previewData.template.smsBody?.length || 0} characters
                        </span>
                      </div>

                      {/* SMS Phone Mockup */}
                      <div className="p-6 bg-gradient-to-b from-gray-100 to-gray-200 flex justify-center">
                        <div className="w-72 bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-gray-800">
                          {/* Phone notch */}
                          <div className="bg-gray-800 h-6 flex justify-center items-end pb-1">
                            <div className="w-20 h-4 bg-black rounded-b-xl"></div>
                          </div>
                          {/* Screen */}
                          <div className="p-4 min-h-[200px] bg-gray-50">
                            <div className="text-xs text-gray-400 text-center mb-3">Auralndn</div>
                            <div className="bg-green-500 text-white rounded-2xl rounded-bl-sm p-3 text-sm shadow-md">
                              {previewData.template.smsBody || '(No SMS content)'}
                            </div>
                            <div className="text-xs text-gray-400 text-right mt-1">Just now</div>
                          </div>
                          {/* Home indicator */}
                          <div className="bg-white h-8 flex justify-center items-center">
                            <div className="w-24 h-1 bg-gray-300 rounded-full"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No content message */}
                  {!previewData.template.emailBody && !previewData.template.smsBody && (
                    <div className="text-center py-12 text-gray-500">
                      <div className="text-4xl mb-3">📭</div>
                      <p>This template has no content yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Templates; 