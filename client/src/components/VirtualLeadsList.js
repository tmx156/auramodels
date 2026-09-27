import React, { useMemo, memo, useCallback, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import LazyImage from './LazyImage';
import { getOptimizedImageUrl, loadImageWithPriority } from '../utils/imageUtils';

/**
 * VirtualLeadsList - Premium 60fps virtual scrolling using react-virtuoso
 * This is the same library used by Instagram for their feed
 *
 * Advantages over react-window:
 * - Auto-measures row heights (no fixed height needed)
 * - Built-in smooth scrolling
 * - Better scroll position accuracy
 * - Native infinite scroll support
 * - Window scrolling support
 */

// Row component - memoized for performance
const LeadRow = memo(({
  lead,
  isSelected,
  onLeadClick,
  onSelectLead,
  statusFilter,
  getStatusBadgeClass,
  formatStatusDisplay,
  formatDate,
  isScrolling
}) => {
  if (!lead) return null;

  // Prefetch full image on hover (e-commerce technique)
  const handleMouseEnter = useCallback(() => {
    if (lead.image_url) {
      // Prefetch full-size image with low priority
      loadImageWithPriority(lead.image_url, 10).catch(() => {});
    }
  }, [lead.image_url]);

  return (
    <div
      className={`flex items-center px-6 py-3 border-b border-gray-200 cursor-pointer transition-colors duration-75 hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50' : 'bg-white'
      }`}
      onClick={(e) => {
        if (e.target.type !== 'checkbox') {
          onLeadClick(lead, e);
        }
      }}
      onMouseEnter={handleMouseEnter}
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
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 border border-gray-200 animate-pulse" />
        ) : (
          <LazyImage
            src={getOptimizedImageUrl(lead.image_url, 'thumbnail') || ''}
            alt={lead.name}
            className="w-6 h-6 rounded-full object-cover border border-gray-200"
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
          {formatStatusDisplay ? formatStatusDisplay(lead.status) : lead.status}
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

LeadRow.displayName = 'LeadRow';

const VirtualLeadsList = ({
  leads,
  onLeadClick,
  onSelectLead,
  selectedLeads,
  statusFilter,
  formatStatusDisplay,
  getStatusBadgeClass,
  formatDate,
  height = 600
}) => {
  const virtuosoRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  // Memoize selected set for O(1) lookup
  const selectedSet = useMemo(() => {
    return new Set(selectedLeads.map(String));
  }, [selectedLeads]);

  // Track scrolling state for placeholder optimization
  const [isScrolling, setIsScrolling] = React.useState(false);

  const handleScroll = useCallback(() => {
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling(true);
    }

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set timeout to detect scroll end (100ms for snappy feel)
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
      <LeadRow
        lead={lead}
        isSelected={isSelected}
        onLeadClick={onLeadClick}
        onSelectLead={onSelectLead}
        statusFilter={statusFilter}
        getStatusBadgeClass={getStatusBadgeClass}
        formatStatusDisplay={formatStatusDisplay}
        formatDate={formatDate}
        isScrolling={isScrolling}
      />
    );
  }, [leads, selectedSet, onLeadClick, onSelectLead, statusFilter, getStatusBadgeClass, formatStatusDisplay, formatDate, isScrolling]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-white shadow overflow-hidden rounded-lg">
      {/* Table Header - Fixed */}
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
        style={{ height }}
        totalCount={leads.length}
        itemContent={itemContent}
        onScroll={handleScroll}
        overscan={200}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        defaultItemHeight={52}
        computeItemKey={(index) => leads[index]?.id || index}
      />
    </div>
  );
};

export default VirtualLeadsList;
