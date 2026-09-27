const express = require('express');
const router = express.Router();

// OS Places API key - should be in environment variable
const OS_PLACES_API_KEY = process.env.OS_PLACES_API_KEY || '7to0aV9GAv9myWT4xaYjvZh3AXGQa8NB';

// Lookup addresses by postcode
router.get('/lookup/:postcode', async (req, res) => {
  try {
    const { postcode } = req.params;

    if (!postcode || postcode.length < 5) {
      return res.status(400).json({ error: 'Invalid postcode' });
    }

    // Clean up postcode
    const cleanPostcode = postcode.trim().toUpperCase().replace(/\s+/g, '');

    // Basic UK postcode validation
    const postcodePattern = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/i;
    if (!postcodePattern.test(cleanPostcode)) {
      return res.status(400).json({ error: 'Invalid UK postcode format' });
    }

    const response = await fetch(
      `https://api.os.uk/search/places/v1/postcode?postcode=${encodeURIComponent(cleanPostcode)}&key=${OS_PLACES_API_KEY}`
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('OS Places API error:', data);
      return res.status(response.status).json({ error: 'Postcode lookup failed' });
    }

    // Transform results to simpler format
    if (data.results && data.results.length > 0) {
      const addresses = data.results.map(result => {
        const dpa = result.DPA;
        const parts = [];
        if (dpa.BUILDING_NUMBER) parts.push(dpa.BUILDING_NUMBER);
        if (dpa.BUILDING_NAME) parts.push(dpa.BUILDING_NAME);
        if (dpa.THOROUGHFARE_NAME) parts.push(dpa.THOROUGHFARE_NAME);
        if (dpa.POST_TOWN) parts.push(dpa.POST_TOWN);
        if (dpa.POSTCODE) parts.push(dpa.POSTCODE);

        return {
          display: parts.join(', '),
          full: dpa.ADDRESS,
          buildingNumber: dpa.BUILDING_NUMBER || '',
          buildingName: dpa.BUILDING_NAME || '',
          street: dpa.THOROUGHFARE_NAME || '',
          town: dpa.POST_TOWN || '',
          postcode: dpa.POSTCODE || ''
        };
      });

      return res.json({ addresses });
    }

    return res.json({ addresses: [] });
  } catch (error) {
    console.error('Postcode lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
