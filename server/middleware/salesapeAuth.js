/**
 * SalesAPE API Key Authentication Middleware
 * 
 * This middleware authenticates requests from SalesAPE using API key authentication.
 * SalesAPE will send requests with an API key in the Authorization header or as a query parameter.
 */

const salesapeAuth = (req, res, next) => {
  try {
    // Get API key from Authorization header (Bearer token or API key)
    const authHeader = req.header('Authorization');
    let apiKey = null;

    if (authHeader) {
      // Support both "Bearer <key>" and direct API key
      if (authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.replace('Bearer ', '');
      } else if (authHeader.startsWith('ApiKey ')) {
        apiKey = authHeader.replace('ApiKey ', '');
      } else {
        // Direct API key
        apiKey = authHeader;
      }
    }

    // Fallback: Check query parameter
    if (!apiKey) {
      apiKey = req.query.api_key || req.query.apikey;
    }

    // Fallback: Check X-API-Key header
    if (!apiKey) {
      apiKey = req.header('X-API-Key');
    }

    if (!apiKey) {
      console.error('SalesAPE Auth: No API key provided');
      return res.status(401).json({ 
        message: 'API key required',
        error: 'Missing authentication credentials'
      });
    }

    // Get expected API key from environment
    const expectedApiKey = process.env.SALESAPE_API_KEY;
    
    if (!expectedApiKey) {
      console.error('SalesAPE Auth: SALESAPE_API_KEY not configured in environment');
      return res.status(500).json({ 
        message: 'Server configuration error',
        error: 'API key authentication not configured'
      });
    }

    // Verify API key
    if (apiKey !== expectedApiKey) {
      console.error('SalesAPE Auth: Invalid API key provided');
      return res.status(401).json({ 
        message: 'Invalid API key',
        error: 'Authentication failed'
      });
    }

    // Add SalesAPE context to request
    req.salesape = {
      authenticated: true,
      apiKey: apiKey.substring(0, 8) + '...' // Log partial key for debugging
    };

    console.log('✅ SalesAPE API request authenticated');
    next();
  } catch (error) {
    console.error('SalesAPE Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Authentication error',
      error: error.message
    });
  }
};

module.exports = salesapeAuth;

