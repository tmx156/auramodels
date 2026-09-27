import React from 'react';
import { FiCheckCircle, FiCircle, FiMessageSquare, FiTarget, FiTrendingUp, FiXCircle, FiExternalLink } from 'react-icons/fi';

/**
 * SalesApe Status Display Component
 * Shows the current status and engagement metrics from SalesApe
 */
const SalesApeStatus = ({ lead }) => {
  // If no SalesApe data, don't show anything
  if (!lead?.salesape_record_id && !lead?.salesape_sent_at) {
    return null;
  }

  const {
    salesape_status,
    salesape_initial_message_sent,
    salesape_user_engaged,
    salesape_goal_presented,
    salesape_goal_hit,
    salesape_follow_ups_ended,
    salesape_opted_out,
    salesape_conversation_summary,
    salesape_portal_link,
    salesape_last_updated
  } = lead;

  return (
    <div className="bg-white shadow rounded-lg p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <FiMessageSquare className="mr-2 h-5 w-5 text-indigo-600" />
          SalesApe AI Status
        </h3>
        {salesape_portal_link && (
          <a
            href={salesape_portal_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800"
          >
            View Conversation
            <FiExternalLink className="ml-1 h-4 w-4" />
          </a>
        )}
      </div>

      {/* Current Status */}
      {salesape_status && (
        <div className="mb-4 p-3 bg-indigo-50 rounded-md">
          <div className="text-sm font-medium text-indigo-900">
            Current Status: <span className="font-bold">{salesape_status}</span>
          </div>
          {salesape_last_updated && (
            <div className="text-xs text-indigo-600 mt-1">
              Last updated: {new Date(salesape_last_updated).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Engagement Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatusItem
          icon={FiMessageSquare}
          label="Initial Message"
          status={salesape_initial_message_sent}
        />
        <StatusItem
          icon={FiMessageSquare}
          label="User Engaged"
          status={salesape_user_engaged}
          highlight={salesape_user_engaged}
        />
        <StatusItem
          icon={FiTarget}
          label="Goal Presented"
          status={salesape_goal_presented}
        />
        <StatusItem
          icon={FiTrendingUp}
          label="Goal Hit"
          status={salesape_goal_hit}
          highlight={salesape_goal_hit}
          success
        />
      </div>

      {/* Opt Out / Follow-ups Ended */}
      {(salesape_opted_out || salesape_follow_ups_ended) && (
        <div className="flex gap-3 mb-4">
          {salesape_opted_out && (
            <div className="flex items-center text-sm text-red-600">
              <FiXCircle className="mr-1 h-4 w-4" />
              Opted Out
            </div>
          )}
          {salesape_follow_ups_ended && (
            <div className="flex items-center text-sm text-gray-600">
              <FiCheckCircle className="mr-1 h-4 w-4" />
              Follow-ups Complete
            </div>
          )}
        </div>
      )}

      {/* Conversation Summary */}
      {salesape_conversation_summary && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            Conversation Summary
          </h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {salesape_conversation_summary}
          </p>
        </div>
      )}

      {/* Goal Hit Celebration */}
      {salesape_goal_hit && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center text-green-800">
            <FiTrendingUp className="mr-2 h-5 w-5" />
            <span className="font-medium">🎉 SalesApe achieved the goal!</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for status items
const StatusItem = ({ icon: Icon, label, status, highlight, success }) => {
  return (
    <div className={`
      flex items-center p-2 rounded-md
      ${highlight 
        ? success 
          ? 'bg-green-50 text-green-800' 
          : 'bg-blue-50 text-blue-800'
        : 'bg-gray-50 text-gray-600'
      }
    `}>
      {status ? (
        <FiCheckCircle className={`mr-2 h-4 w-4 ${highlight ? (success ? 'text-green-600' : 'text-blue-600') : 'text-gray-400'}`} />
      ) : (
        <FiCircle className="mr-2 h-4 w-4 text-gray-300" />
      )}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
};

export default SalesApeStatus;
