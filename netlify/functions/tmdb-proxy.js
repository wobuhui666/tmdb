const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const TMDB_BASE_URL = 'https://api.themoviedb.org';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const VERCEL_UPLOAD_API = 'https://api.vercel.com/v2/files';

// Vercel token for authentication (you need to set this as an environment variable)
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

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
        if (!event.rawUrl) {
            console.error('FATAL: event.rawUrl is missing.');
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Internal Server Configuration Error: Unable to determine request path.' }),
            };
        }

        const incomingUrl = new URL(event.rawUrl);
        const extractedPathAndQuery = incomingUrl.pathname + incomingUrl.search;

        // Check if the request is for an image
        if (incomingUrl.pathname.startsWith('/t/p/')) {
            console.log('Image request detected:', incomingUrl.pathname);

            // Build the TMDB image URL
            const tmdbImageUrl = `${TMDB_IMAGE_BASE_URL}${incomingUrl.pathname.replace('/t/p', '')}`;
            console.log('Fetching TMDB image:', tmdbImageUrl);

            // Fetch the image from TMDB
            const imageResponse = await axios.get(tmdbImageUrl, { responseType: 'stream' });

            // Save the image temporarily
            const tempFilePath = path.join('/tmp', path.basename(tmdbImageUrl));
            const writer = fs.createWriteStream(tempFilePath);
            imageResponse.data.pipe(writer);

            // Wait for the file to finish writing
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log('Image saved locally:', tempFilePath);

            // Upload the image to Vercel
            const formData = new FormData();
            formData.append('file', fs.createReadStream(tempFilePath));

            const vercelResponse = await axios.post(VERCEL_UPLOAD_API, formData, {
                headers: {
                    ...formData.getHeaders(),
                    Authorization: `Bearer ${VERCEL_TOKEN}`,
                },
            });

            console.log('Image uploaded to Vercel:', vercelResponse.data);

            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);

            // Return the Vercel direct link
            const vercelDirectLink = `https://cdn.vercel.com/${vercelResponse.data.id}`;
            headers['Content-Type'] = 'application/json';
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ cachedUrl: vercelDirectLink }),
            };
        }

        // Handle non-image requests (original proxy logic)
        const authHeader = event.headers.authorization;
        const tmdbUrl = `${TMDB_BASE_URL}${extractedPathAndQuery}`;
        console.log(`Proxying request to: ${tmdbUrl}`);

        const config = {};
        if (authHeader) {
            config.headers = {
                Authorization: authHeader,
                Accept: 'application/json',
            };
        } else {
            config.headers = { Accept: 'application/json' };
        }

        console.log('Sending request to TMDB with config:', config);
        const response = await axios.get(tmdbUrl, config);
        console.log('Received response from TMDB:', response.status);

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
                error: `Upstream API error: ${error.response.statusText || 'Unknown'}`,
                details: error.response.data || error.message,
            };
            console.error('Upstream API response error status:', error.response.status);
            console.error('Upstream API response data:', error.response.data);
        } else if (error.request) {
            errorBody = { error: 'No response received from upstream API (likely due to malformed URL)', details: error.message };
            console.error('Upstream API no response (check constructed URL):', error.cause ? error.cause.message : error.message);
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