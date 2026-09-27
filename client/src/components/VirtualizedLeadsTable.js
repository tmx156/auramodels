import React, { useState, useCallback, useMemo, useRef, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import LazyImage from './LazyImage';
import { getOptimizedImageUrl } from '../utils/imageUtils';

/**
 * VirtualizedLeadsTable - Premium 60fps table using react-virtuoso
 * Same virtualization library used by Instagram for their feed
 */

// Memoized row component for maximum performance
const TableRow = memo(({
  lead,
  isSelected,
  isScrolling,
  statusFilter,
  onLeadClick,
  onSelectLead,
  getStatusBadgeClass,
  formatDate
}) => {
  if (!lead) return null;

  return (
    <div
      className={`flex items-center px-6 py-4 border-b border-gray-200 cursor-pointer transition-colors duration-75 hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50' : 'bg-white'
      }`}
      onClick={(e) => {
        if (e.target.type !== 'checkbox') {
          onLeadClick(lead, e);
        }
      }}
      style={{
        contain: 'layout style paint',
        willChange: 'transform'
      }}
    >
      {/* Checkbox */}
      <div className="w-12 flex-shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelectLead(lead.id, e.target.checked);
          }}
          className="cursor-pointer"
        />
      </div>

      {/* Photo - show placeholder during fast scroll (Instagram technique) */}
      <div className="w-16 flex-shrink-0">
        {isScrolling ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 border-2 border-gray-200 animate-pulse" />
        ) : (
          <LazyImage
            src={getOptimizedImageUrl(lead.image_url, 'thumbnail') || ''}
            alt={lead.name}
            className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
            enableFadeIn={false}
          />
        )}
      </div>

      {/* Name */}
      <div className="w-48 flex-shrink-0">
        <div className="text-sm font-medium text-gray-900 truncate">
          {lead.name}
        </div>
      </div>

      {/* Phone */}
      <div className="w-32 flex-shrink-0">
        <div className="text-sm text-gray-900 truncate">
          {lead.phone}
        </div>
      </div>

      {/* Postcode */}
      <div className="w-24 flex-shrink-0">
        <div className="text-sm text-gray-900 truncate">
          {lead.postcode}
        </div>
      </div>

      {/* Status */}
      <div className="w-24 flex-shrink-0">
        <span className={getStatusBadgeClass(lead.status)}>
          {lead.status}
        </span>
      </div>

      {/* Reject Reason (only for Rejected status) */}
      {statusFilter === 'Rejected' && (
        <div className="w-48 flex-shrink-0">
          <div className="text-sm text-red-600 font-medium truncate">
            {lead.reject_reason || 'No reason specified'}
          </div>
        </div>
      )}

      {/* Booker */}
      <div className="w-32 flex-shrink-0">
        <div className="text-sm text-gray-900 truncate">
          {lead.booker?.name || 'N/A'}
        </div>
      </div>

      {/* Date Booked */}
      <div className="w-32 flex-shrink-0">
        <div className="text-sm text-gray-900 truncate">
          {lead.date_booked ? formatDate(lead.date_booked) : 'N/A'}
        </div>
      </div>

      {/* Actions */}
      <div className="w-32 flex-shrink-0">
        <div className="flex items-center justify-end space-x-2">
          <button
            onClick={(e) => e.stopPropagation()}
            className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50"
            title="Book Appointment"
          >
            📅
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
            title="View Details"
          >
            👁️
          </button>
        </div>
      </div>
    </div>
  );
});

TableRow.displayName = 'TableRow';

const VirtualizedLeadsTable = ({
  leads,
  onLeadClick,
  onSelectLead,
  selectedLeads,
  statusFilter,
  getStatusBadgeClass,
  formatDate
}) => {
  const virtuosoRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  // Memoize selected set for O(1) lookup
  const selectedSet = useMemo(() => {
    return new Set(selectedLeads.map(String));
  }, [selectedLeads]);

  // Track scrolling state for placeholder optimization
  const [isScrolling, setIsScrolling] = useState(false);

  const handleScroll = useCallback(() => {
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling(true);
    }

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // 100ms timeout for snappy feel
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      setIsScrolling(false);
    }, 100);
  }, []);

  // Handle select all checkbox
  const handleSelectAll = useCallback((e) => {
    if (e.target.checked) {
      leads.forEach(lead => onSelectLead(lead.id, true));
    } else {
      leads.forEach(lead => onSelectLead(lead.id, false));
    }
  }, [leads, onSelectLead]);

  const allSelected = leads.length > 0 && leads.every(lead => selectedSet.has(String(lead.id)));

  // Memoized row renderer for Virtuoso
  const itemContent = useCallback((index) => {
    const lead = leads[index];
    const isSelected = selectedSet.has(String(lead?.id));

    return (
      <TableRow
        lead={lead}
        isSelected={isSelected}
        isScrolling={isScrolling}
        statusFilter={statusFilter}
        onLeadClick={onLeadClick}
        onSelectLead={onSelectLead}
        getStatusBadgeClass={getStatusBadgeClass}
        formatDate={formatDate}
      />
    );
  }, [leads, selectedSet, isScrolling, statusFilter, onLeadClick, onSelectLead, getStatusBadgeClass, formatDate]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-white shadow overflow-hidden">
      {/* Table Header */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div className="w-12 flex-shrink-0">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="cursor-pointer"
            />
          </div>
          <div className="w-16 flex-shrink-0">Photo</div>
          <div className="w-48 flex-shrink-0">Name</div>
          <div className="w-32 flex-shrink-0">Phone</div>
          <div className="w-24 flex-shrink-0">Postcode</div>
          <div className="w-24 flex-shrink-0">Status</div>
          {statusFilter === 'Rejected' && (
            <div className="w-48 flex-shrink-0">Reject Reason</div>
          )}
          <div className="w-32 flex-shrink-0">Booker</div>
          <div className="w-32 flex-shrink-0">Date Booked</div>
          <div className="w-32 flex-shrink-0">Actions</div>
        </div>
      </div>

      {/* Virtuoso - Instagram/Meta's preferred virtualization approach */}
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: 600 }}
        totalCount={leads.length}
        itemContent={itemContent}
        onScroll={handleScroll}
        overscan={200}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        defaultItemHeight={56}
        computeItemKey={(index) => leads[index]?.id || index}
      />
    </div>
  );
};

export default VirtualizedLeadsTable;
