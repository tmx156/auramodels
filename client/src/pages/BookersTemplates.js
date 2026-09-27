import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiEye, FiSend, FiMail, FiPhone, FiSave, FiX, FiExternalLink } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const BookersTemplates = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [variables, setVariables] = useState([]);
  const [emailAccounts, setEmailAccounts] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    type: 'no_answer', // default to no_answer
    subject: '',
    emailBody: '',
    smsBody: '',
    reminderDays: 5,
    sendEmail: true,
    sendSMS: false,
    isActive: true,
    emailAccount: '' // Empty = use user's assigned account
  });

  useEffect(() => {
    fetchTemplates();
    fetchVariables();
    fetchEmailAccounts();
  }, [user]);

  const fetchTemplates = async () => {
    try {
      // Admin sees ALL bookers' templates, bookers see only their own
      const endpoint = user?.role === 'admin' 
        ? '/api/templates'  // Admin gets all templates
        : '/api/templates?bookersOnly=true';  // Bookers get only their own
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Filter for bookers template types
        // Admin sees: no_answer, no_photo, invitation_email, custom, booker (Lead Details Templates)
        // Bookers see: no_answer, no_photo, invitation_email only
        const allowedTypes = user?.role === 'admin'
          ? ['no_answer', 'no_photo', 'invitation_email', 'custom', 'booker']
          : ['no_answer', 'no_photo', 'invitation_email'];
        setTemplates(data.filter(t => allowedTypes.includes(t.type)));
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVariables = async () => {
    try {
      const response = await fetch('/api/templates/variables/list', {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingTemplate
        ? `/api/templates/${editingTemplate._id || editingTemplate.id}`
        : '/api/templates';
      const method = editingTemplate ? 'PUT' : 'POST';
      // Always use a valid type
      const validType = formData.type && [
        'no_answer',
        'no_photo',
        'invitation_email'
      ].includes(formData.type) ? formData.type : 'no_answer';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ...formData, type: validType })
      });
      if (response.ok) {
        alert('Template saved successfully!');
        setShowModal(false);
        setEditingTemplate(null);
        resetForm();
        fetchTemplates();
      } else {
        const error = await response.json();
        alert(error.message || 'Error saving template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template');
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
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
      emailAccount: template.email_account || template.emailAccount || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
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
    setPreviewData(template);
    setShowPreview(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'no_answer', // default to no_answer
      subject: '',
      emailBody: '',
      smsBody: '',
      reminderDays: 5,
      sendEmail: true,
      sendSMS: false,
      isActive: true,
      emailAccount: '' // Empty = use user's assigned account
    });
  };

  const insertVariable = (variable) => {
    // variable already arrives pre-bracketed (e.g. "{leadName}") from the
    // /api/templates/variables/list endpoint - do not wrap it again, or the
    // backend's single-brace substitution leaves literal braces in the sent message.
    const textarea = document.activeElement;
    if (textarea && textarea.tagName === 'TEXTAREA') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newText = text.substring(0, start) + variable + text.substring(end);

      // Update form data first
      const fieldName = textarea.name;
      setFormData(prev => ({
        ...prev,
        [fieldName]: newText
      }));

      // Update the textarea value and cursor position after state update
      setTimeout(() => {
        textarea.value = newText;
        textarea.setSelectionRange(start + variable.length, start + variable.length);
        textarea.focus();

        // Trigger input event to ensure React knows about the change
        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);
      }, 0);
    } else {
      // Fallback: append to both fields if no active textarea
      setFormData(prev => ({
        ...prev,
        smsBody: prev.smsBody + variable,
        emailBody: prev.emailBody + variable
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Booker Templates</h1>
              <p className="text-gray-600 mt-2">
                {user?.role === 'admin' 
                  ? 'View and manage all bookers\' templates' 
                  : 'Create and manage your personal templates'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium">No Answer:</span> Triggered when status = "No answer" |
                <span className="font-medium ml-2">No Photo:</span> Triggered when status = "No photo" |
                <span className="font-medium ml-2">Invitation Email:</span> Quick button in messages
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/templates')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 shadow"
                title="View all other templates (Diary, Retargeting, Sale)"
              >
                <FiExternalLink /> All Templates
              </button>
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  resetForm();
                  setShowModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow"
              >
                <FiPlus /> New Template
              </button>
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div>Loading...</div>
          ) : templates.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 text-5xl mb-4">📝</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No templates yet</h3>
              <p className="text-gray-500">Create your first template to get started!</p>
            </div>
          ) : (
            templates.map((template) => (
              <div key={template._id} className="bg-white rounded-lg shadow p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  {template.sendEmail && <FiMail className="text-blue-500" title="Email" />}
                  {template.sendSMS && <FiPhone className="text-green-500" title="SMS" />}
                  <span className="text-lg font-semibold">{template.name}</span>
                </div>
                {/* Show booker name for admin */}
                {user?.role === 'admin' && template.creator?.name && (
                  <div className="text-xs text-blue-600 -mt-2">
                    <span className="font-medium">By:</span> {template.creator.name}
                  </div>
                )}
                <div className="text-gray-700 text-sm line-clamp-3">{template.smsBody || template.emailBody}</div>
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => handlePreview(template)} className="p-2 hover:bg-gray-100 rounded" title="Preview"><FiEye /></button>
                  <button onClick={() => handleEdit(template)} className="p-2 hover:bg-gray-100 rounded" title="Edit"><FiEdit /></button>
                  <button onClick={() => handleDelete(template._id)} className="p-2 hover:bg-gray-100 rounded text-red-600" title="Delete"><FiTrash2 /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Template Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {editingTemplate ? 'Edit Your Template' : 'Create New Template'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <FiX />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Template Name
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Template Type
                      </label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="no_answer">📞 No Answer (Auto-triggered when status = No answer)</option>
                        <option value="no_photo">📷 No Photo (Auto-triggered when status = No photo)</option>
                        <option value="invitation_email">📧 Invitation Email (Quick button in messages)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.type === 'no_answer'
                          ? 'This template triggers with confirmation when you change a lead status to "No answer"'
                          : formData.type === 'no_photo'
                          ? 'This template triggers with confirmation when you change a lead status to "No photo"'
                          : 'This template appears as a quick button in the Lead Details message section'}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.sendEmail}
                          onChange={(e) => setFormData({...formData, sendEmail: e.target.checked})}
                          className="mr-2"
                        />
                        <span className="text-sm">Send Email</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.sendSMS}
                          onChange={(e) => setFormData({...formData, sendSMS: e.target.checked})}
                          className="mr-2"
                        />
                        <span className="text-sm">Send SMS</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                          className="mr-2"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                  </div>

                  {/* Variables */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available Variables
                    </label>
                    <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                      <div className="grid grid-cols-1 gap-2">
                        {variables.map((variable) => (
                          <button
                            key={variable.name}
                            type="button"
                            onClick={() => insertVariable(variable.name)}
                            className="text-left p-2 hover:bg-gray-100 rounded text-sm"
                            title={variable.description}
                          >
                            <div className="font-mono text-blue-600">{variable.name}</div>
                            <div className="text-gray-600 text-xs">{variable.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Content */}
                {formData.sendEmail && (
                  <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FiMail /> Email Content
                    </h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Line
                      </label>
                      <input
                        type="text"
                        value={formData.subject}
                        onChange={(e) => setFormData({...formData, subject: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Body
                      </label>
                      <textarea
                        name="emailBody"
                        value={formData.emailBody}
                        onChange={(e) => setFormData({...formData, emailBody: e.target.value})}
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        required
                      />
                    </div>
                    {/* Email Account Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Send From Email Account
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
                          : "Email will always be sent from the selected account"}
                      </p>
                    </div>
                  </div>
                )}

                {/* SMS Content */}
                {formData.sendSMS && (
                  <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FiPhone /> SMS Content
                    </h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SMS Message
                      </label>
                      <textarea
                        name="smsBody"
                        value={formData.smsBody}
                        onChange={(e) => setFormData({...formData, smsBody: e.target.value})}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <FiSave className="inline mr-1" /> Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreview && previewData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-lg w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Preview: {previewData.name}</h3>
                <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded"><FiX /></button>
              </div>
              {previewData.sendEmail && (
                <div className="mb-4">
                  <h4 className="font-semibold mb-1">Email</h4>
                  <div className="border rounded p-2 bg-gray-50">
                    <div className="font-bold mb-1">Subject: {previewData.subject}</div>
                    <div className="whitespace-pre-line font-mono text-sm">{previewData.emailBody}</div>
                  </div>
                </div>
              )}
              {previewData.sendSMS && (
                <div>
                  <h4 className="font-semibold mb-1">SMS</h4>
                  <div className="border rounded p-2 bg-gray-50">
                    <div className="whitespace-pre-line font-mono text-sm">{previewData.smsBody}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookersTemplates; 