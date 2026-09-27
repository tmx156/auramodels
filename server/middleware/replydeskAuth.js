const replydeskAuth = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    let apiKey = null;

    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.replace('Bearer ', '');
      } else if (authHeader.startsWith('ApiKey ')) {
        apiKey = authHeader.replace('ApiKey ', '');
      } else {
        apiKey = authHeader;
      }
    }

    if (!apiKey) {
      apiKey = req.query.api_key || req.query.apikey;
    }

    if (!apiKey) {
      apiKey = req.header('X-API-Key');
    }

    if (!apiKey) {
      return res.status(401).json({
        message: 'API key required',
        error: 'Missing authentication credentials'
      });
    }

    const expectedApiKey = process.env.REPLYDESK_CALENDAR_API_KEY;

    if (!expectedApiKey) {
      return res.status(500).json({
        message: 'Server configuration error',
        error: 'API key authentication not configured'
      });
    }

    if (apiKey !== expectedApiKey) {
      return res.status(401).json({
        message: 'Invalid API key',
        error: 'Authentication failed'
      });
    }

    req.replydesk = {
      authenticated: true,
      apiKey: apiKey.substring(0, 8) + '...'
    };

    next();
  } catch (error) {
    console.error('ReplyDesk Auth middleware error:', error);
    res.status(500).json({
      message: 'Authentication error',
      error: error.message
    });
  }
};

module.exports = replydeskAuth;
