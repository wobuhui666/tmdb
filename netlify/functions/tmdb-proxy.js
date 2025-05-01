// netlify/functions/tmdb-proxy.js
const axios = require('axios');
const TMDB_BASE_URL = 'https://api.themoviedb.org';

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: headers,
            body: '',
        };
    }

    if (event.httpMethod !== 'GET') {
         return {
            statusCode: 405,
            headers: headers,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        // --- Get the FULL original path and query string ---
        // Use event.rawUrl which typically contains the path as requested by the client
        // BEFORE the rewrite rule was applied by Netlify.
        // For a request like https://.../3/search/tv?query=..., event.rawUrl should be "/3/search/tv?query=..."
        if (!event.rawUrl) {
             console.error("FATAL: event.rawUrl is missing. Cannot determine the target TMDB path.");
             // Return a server error because the function cannot operate without the path
             return {
                 statusCode: 500,
                 headers: { ...headers, 'Content-Type': 'application/json' },
                 body: JSON.stringify({ error: 'Internal Server Configuration Error: Unable to determine request path.' }),
             };
        }
        // Assign the raw URL directly. It should start with /3/ or similar
        const fullPathAndQuery = event.rawUrl;

        const authHeader = event.headers.authorization;

        // --- Build TMDB Request ---
        // Prepend the TMDB base URL to the full path and query string from rawUrl
        const tmdbUrl = `${TMDB_BASE_URL}${fullPathAndQuery}`; // <-- Use fullPathAndQuery
        console.log(`Proxying request to: ${tmdbUrl}`);

        const config = {};
        if (authHeader) {
            config.headers = {
                'Authorization': authHeader,
                'Accept': 'application/json',
            };
        } else {
             config.headers = { 'Accept': 'application/json' };
        }

        // --- Send Request to TMDB ---
        console.log('Sending request to TMDB with config:', config);
        const response = await axios.get(tmdbUrl, config);
        console.log('Received response from TMDB:', response.status);

        // --- Return Response ---
        headers['Content-Type'] = response.headers['content-type'] || 'application/json';

        return {
            statusCode: response.status,
            headers: headers,
            body: JSON.stringify(response.data),
        };

    } catch (error) {
        console.error('TMDB API proxy error:', error);

        let statusCode = 500;
        let errorBody = { error: 'Internal Server Error', details: error.message };

        if (error.response) {
            statusCode = error.response.status;
            errorBody = {
                 error: `Upstream API error: ${error.response.statusText || 'Unknown'}`, // Added statusText fallback
                 details: error.response.data || error.message
                };
            console.error('Upstream API response error status:', error.response.status);
            console.error('Upstream API response data:', error.response.data);
        } else if (error.request) {
            errorBody = { error: 'No response received from upstream API', details: error.message };
             console.error('Upstream API no response:', error.request);
        } else {
             console.error('Axios request setup error:', error.message);
        }

        headers['Content-Type'] = 'application/json';

        return {
            statusCode: statusCode,
            headers: headers,
            body: JSON.stringify(errorBody),
        };
    }
};
