import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { FiCheckCircle, FiGitCommit, FiInfo, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import gitVersion from '../version.json';

const SEEN_COMMIT_KEY = 'patchNotesSeenCommit';

export const CURRENT_VERSION = {
  version: gitVersion.version || '1.0.0',
  commitHash: gitVersion.commitHash || 'unknown',
  commitMessage: gitVersion.commitMessage || 'No message',
  commitDate: gitVersion.commitDate || new Date().toISOString(),
  branch: gitVersion.branch || 'unknown',
  author: gitVersion.author || 'Unknown',
};

const PatchNotesContext = createContext({
  isOpen: false,
  openPatchNotes: () => {},
  closePatchNotes: () => {},
  currentVersion: CURRENT_VERSION,
  hasUpdate: false,
});

export const usePatchNotes = () => useContext(PatchNotesContext);

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatTime = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const getDayName = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

// ============================================
// ALL Weekly Updates - Individual Changes
// ============================================
const getWeeklyUpdates = () => {
  const updates = [
    // TODAY'S UPDATE (Feb 20) - 9 Individual Changes
    {
      id: 1,
      date: '2026-02-20',
      time: '09:23 PM',
      message: 'Add admin Price List page with full CRUD for packages via existing API',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'feature',
    },
    {
      id: 2,
      date: '2026-02-20',
      time: '09:22 PM',
      message: 'Fix VAT calculation bugs: respect vatInclusive flag and actual vatRate instead of hardcoded 20%',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'fix',
    },
    {
      id: 3,
      date: '2026-02-20',
      time: '09:21 PM',
      message: 'Fix missing depositAmount/financeAmount in buildContractData fallback',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'fix',
    },
    {
      id: 4,
      date: '2026-02-20',
      time: '09:20 PM',
      message: 'Fix contract HTML to show dynamic VAT rate instead of hardcoded "VAT@20%"',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'fix',
    },
    {
      id: 5,
      date: '2026-02-20',
      time: '09:19 PM',
      message: 'Add vatRate to contract data flow (PackageSelectionModal -> SendContractModal -> contracts API -> PDF)',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'feature',
    },
    {
      id: 6,
      date: '2026-02-20',
      time: '09:18 PM',
      message: 'Disable SalesApe integration (frontend + backend)',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'change',
    },
    {
      id: 7,
      date: '2026-02-20',
      time: '09:17 PM',
      message: 'Add collapsible sidebar with toggle button',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'feature',
    },
    {
      id: 8,
      date: '2026-02-20',
      time: '09:16 PM',
      message: 'Add patch notes system with Git integration',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'feature',
    },
    {
      id: 9,
      date: '2026-02-20',
      time: '09:15 PM',
      message: 'Update sales/reports routes and public booking',
      author: 'Tin',
      hash: '71f9cd4',
      isNew: true,
      type: 'improvement',
    },
    // PREVIOUS DAYS
    {
      id: 10,
      date: '2026-02-19',
      time: '11:49 PM',
      message: 'Add generic lead webhook for external landing pages',
      author: 'Tin',
      hash: '0479ef7',
      isNew: false,
      type: 'feature',
    },
    {
      id: 11,
      date: '2026-02-18',
      time: '02:34 AM',
      message: 'Add 3rd booking slot column to calendar system',
      author: 'Tin',
      hash: '841314b',
      isNew: false,
      type: 'feature',
    },
  ];
  return updates;
};

// Group updates by date
const groupByDate = (updates) => {
  const grouped = {};
  updates.forEach(update => {
    if (!grouped[update.date]) {
      grouped[update.date] = [];
    }
    grouped[update.date].push(update);
  });
  return grouped;
};

export const PatchNotesProvider = ({ children }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    const seenCommit = localStorage.getItem(SEEN_COMMIT_KEY);
    if (seenCommit !== CURRENT_VERSION.commitHash) {
      setHasUpdate(true);
    }
  }, [isAdmin]);

  const openPatchNotes = useCallback(() => {
    setIsOpen(true);
    setTimeout(() => setIsAnimating(true), 10);
  }, []);

  const closePatchNotes = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => setIsOpen(false), 300);
  }, []);

  const markAsSeen = useCallback(() => {
    localStorage.setItem(SEEN_COMMIT_KEY, CURRENT_VERSION.commitHash);
    setHasUpdate(false);
  }, []);

  const hasSeenCurrentVersion = useCallback(() => {
    const seenCommit = localStorage.getItem(SEEN_COMMIT_KEY);
    return seenCommit === CURRENT_VERSION.commitHash;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (!hasSeenCurrentVersion()) {
      const timer = setTimeout(() => openPatchNotes(), 800);
      return () => clearTimeout(timer);
    }
  }, [isAdmin, hasSeenCurrentVersion, openPatchNotes]);

  return (
    <PatchNotesContext.Provider value={{
      isOpen, isAnimating, openPatchNotes, closePatchNotes, markAsSeen,
      currentVersion: CURRENT_VERSION, hasUpdate, isAdmin,
    }}>
      {children}
    </PatchNotesContext.Provider>
  );
};

const PatchNotesModalContent = () => {
  const { isOpen, isAnimating, closePatchNotes, markAsSeen } = usePatchNotes();
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  
  const updates = useMemo(() => getWeeklyUpdates(), []);
  const groupedUpdates = useMemo(() => groupByDate(updates), [updates]);
  const sortedDates = useMemo(() => Object.keys(groupedUpdates).sort().reverse(), [groupedUpdates]);

  if (!isOpen) return null;

  const handleContinue = () => {
    setHasAcknowledged(true);
    markAsSeen();
    setTimeout(() => {
      closePatchNotes();
      setHasAcknowledged(false);
    }, 300);
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
      isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'
    }`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

      <div className={`relative w-full max-w-md transform transition-all duration-300 ${
        isAnimating ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
      }`}>
        <div className="relative overflow-hidden rounded-3xl bg-white shadow-2xl">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <FiGitCommit className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">This Week's Updates</h1>
                <p className="text-xs text-gray-500">{updates.length} updates • {CURRENT_VERSION.branch}</p>
              </div>
            </div>
          </div>

          {/* Updates - Grouped by Date */}
          <div className="max-h-[55vh] overflow-y-auto px-4 py-3">
            <div className="space-y-4">
              {sortedDates.map((date) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {getDayName(date)}, {formatDate(date)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs text-gray-400">
                      {groupedUpdates[date].length} update{groupedUpdates[date].length > 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  {/* Updates for this date */}
                  <div className="space-y-2">
                    {groupedUpdates[date].map((update) => (
                      <div 
                        key={update.id}
                        className={`rounded-xl overflow-hidden transition-all duration-200 ${
                          update.isNew ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'
                        }`}
                      >
                        <button
                          onClick={() => toggleExpand(update.id)}
                          className="w-full p-3 text-left"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${update.isNew ? 'bg-blue-500' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2 pr-6">
                                <p className="text-sm font-medium text-gray-900 leading-snug flex-1">
                                  {update.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {/* Type Badge */}
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                  update.type === 'feature' ? 'bg-green-100 text-green-700' :
                                  update.type === 'fix' ? 'bg-red-100 text-red-700' :
                                  update.type === 'improvement' ? 'bg-blue-100 text-blue-700' :
                                  update.type === 'change' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {update.type}
                                </span>
                                <span className="font-mono text-xs text-gray-400">{update.hash}</span>
                                <span className="text-xs text-gray-400">{update.time}</span>
                                {update.isNew && (
                                  <span className="ml-auto px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold uppercase rounded">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="absolute right-6 text-gray-400">
                              {expandedId === update.id ? (
                                <FiChevronUp className="h-4 w-4" />
                              ) : (
                                <FiChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-white border-t border-gray-100">
            <button
              onClick={handleContinue}
              disabled={hasAcknowledged}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
                hasAcknowledged 
                  ? 'bg-gray-100 text-gray-400' 
                  : 'text-white bg-gray-900 hover:bg-gray-800'
              }`}
            >
              {hasAcknowledged ? 'Continuing...' : `Continue (${updates.length} updates)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PatchNotesModal = () => {
  const { isAdmin } = usePatchNotes();
  if (!isAdmin) return null;
  return <PatchNotesModalContent />;
};

export const PatchNotesButton = () => {
  const { openPatchNotes, hasUpdate, isAdmin } = usePatchNotes();
  if (!isAdmin) return null;

  return (
    <button
      onClick={openPatchNotes}
      className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-gray-900 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 flex items-center justify-center"
      title="View Updates"
    >
      <FiInfo className="h-5 w-5" />
      {hasUpdate && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
      )}
    </button>
  );
};

export default PatchNotesModal;
