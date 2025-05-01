// netlify/functions/tmdb-proxy.js
const axios = require('axios');
const TMDB_BASE_URL = 'https://api.themoviedb.org';

// Note: In-memory cache removed as it's unreliable in serverless environments.
// Consider an external cache (e.g., Upstash Redis, FaunaDB) if needed.

exports.handler = async (event, context) => {
    // --- CORS Headers ---
    // Set base CORS headers for all responses
    const headers = {
        'Access-Control-Allow-Origin': '*', // Or restrict to your frontend domain
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    // --- Handle OPTIONS preflight request ---
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: headers,
            body: '',
        };
    }

    // --- Basic check for GET requests (adapt if you need POST etc.) ---
    if (event.httpMethod !== 'GET') {
         return {
            statusCode: 405, // Method Not Allowed
            headers: headers,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        // --- Extract Path and Headers ---
        // event.path often includes the function path prefix (e.g., /.netlify/functions/tmdb-proxy)
        // We need the part *after* that, which corresponds to the TMDB API path.
        // This depends heavily on your netlify.toml rewrite rule.
        // Assuming a rule like "/api/* /.netlify/functions/tmdb-proxy/:splat 200"
        // The original path requested by the client (e.g., /api/3/movie/550?api_key=...)
        // might map so that event.path becomes "/3/movie/550?api_key=..."
        // Or you might need to parse event.rawUrl or use path parameters if defined differently.
        // Let's assume for simplicity the path is correctly passed relative to TMDB_BASE_URL.
        // If using a splat redirect as mentioned above, the path might be available like this:
        let requestedPath = event.path;
        const functionPathPrefix = '/.netlify/functions/tmdb-proxy'; // Adjust if your function name is different
        if (requestedPath.startsWith(functionPathPrefix)) {
             requestedPath = requestedPath.substring(functionPathPrefix.length);
        }
         // If using query string parameters, they are usually in event.queryStringParameters
         // axios handles appending them automatically if they are part of the URL string
         // If they are not part of event.path you might need event.rawUrl or reconstruct it
         // For simplicity, let's assume event.path contains the path + query string needed.
         // A safer approach often involves using event.rawUrl or reconstructing from path and query params.
         // Example using rawUrl (often looks like /api/3/movie/550?query=...):
         // let fullPath = event.rawUrl.replace(/^\/api/, ''); // Assuming /api is your proxy prefix
         // Let's stick to the simpler event.path assumption for now, but be aware:
        const fullPath = requestedPath; // Needs verification based on netlify.toml

        const authHeader = event.headers.authorization;

        // --- Build TMDB Request ---
        const tmdbUrl = `${TMDB_BASE_URL}${fullPath}`;
        console.log(`Proxying request to: ${tmdbUrl}`); // Good for debugging

        const config = {};
        if (authHeader) {
            config.headers = {
                'Authorization': authHeader,
                 // Add Accept if needed, TMDB often requires it
                'Accept': 'application/json',
            };
        } else {
             config.headers = { 'Accept': 'application/json' }; // Still send Accept
        }


        // --- Send Request to TMDB ---
        const response = await axios.get(tmdbUrl, config);

        // --- Return Response ---
        // Ensure Content-Type is set correctly
        headers['Content-Type'] = response.headers['content-type'] || 'application/json';

        return {
            statusCode: response.status,
            headers: headers,
            // Body must be a string
            body: JSON.stringify(response.data),
        };

    } catch (error) {
        console.error('TMDB API proxy error:', error);

        // Default error details
        let statusCode = 500;
        let errorBody = { error: 'Internal Server Error', details: error.message };

        // If the error came from the upstream API (axios)
        if (error.response) {
            statusCode = error.response.status;
            // Forward the upstream error details if available
            errorBody = {
                 error: `Upstream API error: ${error.response.statusText}`,
                 details: error.response.data || error.message // Use upstream data if possible
                };
            console.error('Upstream API response error:', error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            errorBody = { error: 'No response received from upstream API', details: error.message };
             console.error('Upstream API no response:', error.request);
        } else {
             // Something happened in setting up the request that triggered an Error
             console.error('Axios request setup error:', error.message);
        }

        // Ensure CORS headers are on error responses too
        headers['Content-Type'] = 'application/json';

        return {
            statusCode: statusCode,
            headers: headers,
            body: JSON.stringify(errorBody),
        };
    }
};
