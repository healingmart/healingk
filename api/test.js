// api/test.js (초간단 버전)

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { test = '1' } = req.query;
        
        // API 키
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: '❌ API 키 없음' });
        }

        const contentId = '142785'; // 가락관광호텔 고정
        let result = {};

        if (test === '1') {
            // 테스트 1: 최소 파라미터
            result = await simpleTest(apiKey, contentId, '최소파라미터');
        } else if (test === '2') {
            // 테스트 2: contentTypeId 추가
            result = await simpleTestWithType(apiKey, contentId, '12');
        } else if (test === '3') {
            // 테스트 3: 다른 contentTypeId
            result = await simpleTestWithType(apiKey, contentId, '32');
        }

        return res.status(200).json({
            success: true,
            test: test,
            contentId: contentId,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// ===== 초간단 테스트 1 =====
async function simpleTest(apiKey, contentId, name) {
    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
        
        const response = await fetch(url);
        const text = await response.text();
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            return { name, success: false, error: 'JSON 파싱 실패', response: text.substring(0, 200) };
        }
        
        const code = data.resultCode || data.response?.header?.resultCode;
        const msg = data.resultMsg || data.response?.header?.resultMsg;
        
        if (code === '0' || code === '0000') {
            const item = data.response?.body?.items?.item || data.items?.item || data.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    name,
                    success: true,
                    hasOverview: !!itemData.overview,
                    hasTel: !!itemData.tel,
                    overview: itemData.overview?.substring(0, 50) || null
                };
            }
            return { name, success: true, noItem: true };
        }
        
        return { name, success: false, code, msg };
        
    } catch (error) {
        return { name, success: false, error: error.message };
    }
}

// ===== 초간단 테스트 2 =====
async function simpleTestWithType(apiKey, contentId, contentTypeId) {
    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
        
        const response = await fetch(url);
        const text = await response.text();
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            return { contentTypeId, success: false, error: 'JSON 파싱 실패' };
        }
        
        const code = data.resultCode || data.response?.header?.resultCode;
        const msg = data.resultMsg || data.response?.header?.resultMsg;
        
        if (code === '0' || code === '0000') {
            const item = data.response?.body?.items?.item || data.items?.item || data.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    contentTypeId,
                    success: true,
                    hasOverview: !!itemData.overview,
                    overview: itemData.overview?.substring(0, 50) || null
                };
            }
            return { contentTypeId, success: true, noItem: true };
        }
        
        return { contentTypeId, success: false, code, msg };
        
    } catch (error) {
        return { contentTypeId, success: false, error: error.message };
    }
}
