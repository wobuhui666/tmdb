// netlify/functions/tmdb-proxy.js
const axios = require('axios');
// 不需要 require('url')，URL 是 Node.js 的全局对象

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
        if (!event.rawUrl) {
             console.error("FATAL: event.rawUrl is missing.");
             return {
                 statusCode: 500,
                 headers: { ...headers, 'Content-Type': 'application/json' },
                 body: JSON.stringify({ error: 'Internal Server Configuration Error: Unable to determine request path.' }),
             };
        }

        // --- **修正部分开始** ---
        // 使用 URL 对象解析完整的原始 URL
        // 因为 event.rawUrl 包含了完整的 URL (https://...)，可以直接解析
        console.log("Received rawUrl:", event.rawUrl); // 调试：看看原始值
        const incomingUrl = new URL(event.rawUrl);

        // 提取路径名 (e.g., /3/search/tv) 和查询字符串 (e.g., ?api_key=...)
        const extractedPathAndQuery = incomingUrl.pathname + incomingUrl.search;
        console.log("Extracted path and query:", extractedPathAndQuery); // 调试：看看提取的部分
        // --- **修正部分结束** ---

        const authHeader = event.headers.authorization;

        // --- Build TMDB Request ---
        // 使用提取出的路径和查询参数
        const tmdbUrl = `${TMDB_BASE_URL}${extractedPathAndQuery}`; // <-- 使用修正后的路径
        console.log(`Proxying request to: ${tmdbUrl}`); // 调试：检查最终 URL

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
        // ... (错误处理部分保持不变) ...
        console.error('TMDB API proxy error:', error);

        let statusCode = 500;
        let errorBody = { error: 'Internal Server Error', details: error.message };

        if (error.response) {
            statusCode = error.response.status;
            errorBody = {
                 error: `Upstream API error: ${error.response.statusText || 'Unknown'}`,
                 details: error.response.data || error.message
                };
            console.error('Upstream API response error status:', error.response.status);
            console.error('Upstream API response data:', error.response.data);
        } else if (error.request) {
             // 错误仍然属于 "No response received" 类型，但根本原因是 URL 错误
            errorBody = { error: 'No response received from upstream API (likely due to malformed URL)', details: error.message };
             console.error('Upstream API no response (check constructed URL):', error.cause ? error.cause.message : error.message); // 打印更底层的错误
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
