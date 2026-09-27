import React, { useState, useEffect } from 'react';
import { FiMail, FiPhone, FiEye, FiSend, FiX, FiUsers, FiFileText } from 'react-icons/fi';
import axios from 'axios';

const BulkCommunicationModal = ({ isOpen, onClose, selectedLeads, onSuccess }) => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [communicationType, setCommunicationType] = useState('both'); // 'email', 'sms', 'both'
  const [customSubject, setCustomSubject] = useState('');
  const [customEmailBody, setCustomEmailBody] = useState('');
  const [customSmsBody, setCustomSmsBody] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      // Reset form when modal opens
      setSelectedTemplate('');
      setCustomSubject('');
      setCustomEmailBody('');
      setCustomSmsBody('');
      setCommunicationType('both');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedTemplate) {
      loadTemplate();
    }
  }, [selectedTemplate]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      // Only fetch templates created by the current user (bookersOnly=true)
      const response = await axios.get('/api/templates?bookersOnly=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      // Filter templates for lead communication (exclude sale-specific templates)
      const filteredTemplates = response.data.filter(template => {
        // Only show templates created by the user, exclude sale-specific templates
        return !template.type.startsWith('sale_');
      });
      
      setTemplates(filteredTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      alert('Error fetching templates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async () => {
    if (!selectedTemplate) return;
    
    try {
      const template = templates.find(t => t.id === selectedTemplate || t._id === selectedTemplate);
      if (template) {
        setCustomSubject(template.subject || '');
        setCustomEmailBody(template.email_body || template.emailBody || '');
        setCustomSmsBody(template.sms_body || template.smsBody || '');
        
        // Determine communication type from template
        if (template.send_email && template.send_sms) {
          setCommunicationType('both');
        } else if (template.send_email) {
          setCommunicationType('email');
        } else if (template.send_sms) {
          setCommunicationType('sms');
        }
      }
    } catch (error) {
      console.error('Error loading template:', error);
    }
  };

  const sendCommunication = async () => {
    if (!selectedTemplate || selectedLeads.length === 0) return;
    
    try {
      setSending(true);
      
      const payload = {
        templateId: selectedTemplate,
        leadIds: selectedLeads,
        communicationType,
        customSubject: customSubject || undefined,
        customEmailBody: customEmailBody || undefined,
        customSmsBody: customSmsBody || undefined
      };
      
      const response = await axios.post('/api/leads/bulk-communication', payload, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      // Show detailed results
      let resultMessage = `${response.data.message}\n\n${response.data.note || ''}`;

      if (response.data.errorCount > 0) {
        resultMessage += '\n\nErrors:';
        response.data.results.forEach(result => {
          if (result.error || (!result.emailSent && !result.smsSent)) {
            const errorMsg = result.error || 
              (result.emailError ? `Email: ${result.emailError}` : '') +
              (result.smsError ? `SMS: ${result.smsError}` : '');
            resultMessage += `\n• ${result.customerName || result.leadId}: ${errorMsg || 'Failed to send'}`;
          }
        });
      }

      alert(resultMessage);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error sending communications:', error);
      alert(error.response?.data?.message || 'Error sending communications. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-6 border w-full max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">
            Send Communication to {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <FiX className="h-6 w-6" />
          </button>
        </div>

        {/* Selected Leads Summary */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center mb-3">
            <FiUsers className="h-5 w-5 text-gray-600 mr-2" />
            <span className="font-medium text-gray-700">Selected Leads:</span>
            <span className="ml-2 text-sm text-gray-500">({selectedLeads.length} selected)</span>
          </div>
          <div className="text-sm text-gray-600">
            Individual messages will be sent to each selected lead using the template below.
          </div>
        </div>

        {/* Template Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          >
            <option value="">Choose a template...</option>
            {templates.map(template => (
              <option key={template.id || template._id} value={template.id || template._id}>
                {template.name} {template.type ? `(${template.type.replace(/_/g, ' ')})` : ''}
              </option>
            ))}
          </select>
          {loading && (
            <p className="text-sm text-gray-500 mt-1">Loading templates...</p>
          )}
        </div>

        {/* Communication Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Communication Type
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="email"
                checked={communicationType === 'email'}
                onChange={(e) => setCommunicationType(e.target.value)}
                className="mr-2"
              />
              <FiMail className="h-4 w-4 text-blue-600 mr-1" />
              Email Only
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="sms"
                checked={communicationType === 'sms'}
                onChange={(e) => setCommunicationType(e.target.value)}
                className="mr-2"
              />
              <FiPhone className="h-4 w-4 text-green-600 mr-1" />
              SMS Only
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="both"
                checked={communicationType === 'both'}
                onChange={(e) => setCommunicationType(e.target.value)}
                className="mr-2"
              />
              <FiMail className="h-4 w-4 text-blue-600 mr-1" />
              <FiPhone className="h-4 w-4 text-green-600 mr-1" />
              Both
            </label>
          </div>
        </div>

        {/* Custom Content */}
        {(communicationType === 'email' || communicationType === 'both') && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Subject
            </label>
            <input
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter email subject (optional - will use template default if empty)..."
            />
          </div>
        )}

        {(communicationType === 'email' || communicationType === 'both') && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Body
            </label>
            <textarea
              value={customEmailBody}
              onChange={(e) => setCustomEmailBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter email body (optional - will use template default if empty)..."
            />
            <div className="text-xs text-gray-500 mt-1">
              Leave empty to use template default. Use variables like {'{leadName}'}, {'{leadEmail}'}, {'{leadPhone}'}, etc.
            </div>
          </div>
        )}

        {(communicationType === 'sms' || communicationType === 'both') && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SMS Body
            </label>
            <textarea
              value={customSmsBody}
              onChange={(e) => setCustomSmsBody(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter SMS message (optional - will use template default if empty)..."
            />
            <div className="text-xs text-gray-500 mt-1">
              Character count: {customSmsBody.length} (SMS limit: 160 characters per message)
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={sendCommunication}
            disabled={!selectedTemplate || sending || selectedLeads.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending...
              </>
            ) : (
              <>
                <FiSend className="h-4 w-4 mr-2" />
                Send to {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkCommunicationModal;

