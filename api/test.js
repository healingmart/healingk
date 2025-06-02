// api/test.js (안정적인 버전)

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
            // 테스트 1: 최소 파라미터 (성공 확인됨)
            result = await simpleTest(apiKey, contentId);
        } else if (test === '2') {
            // 테스트 2: contentTypeId=12
            result = await testWithType(apiKey, contentId, '12');
        } else if (test === '3') {
            // 테스트 3: contentTypeId=32  
            result = await testWithType(apiKey, contentId, '32');
        } else if (test === 'intro') {
            // 테스트 4: DetailIntro API
            result = await testDetailIntro(apiKey, contentId);
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

// ===== 성공한 최소 파라미터 테스트 =====
async function simpleTest(apiKey, contentId) {
    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const code = data.resultCode || data.response?.header?.resultCode;
        
        if (code === '0' || code === '0000') {
            const item = data.response?.body?.items?.item || data.items?.item || data.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                
                // HTML 태그 제거
                const cleanHTML = (text) => text ? text.replace(/<[^>]*>/g, '').trim() : null;
                
                return {
                    success: true,
                    method: '최소파라미터',
                    data: {
                        overview: itemData.overview || null,
                        tel: itemData.tel || null,
                        homepage: cleanHTML(itemData.homepage) || null,
                        usetime: itemData.usetime || null,
                        parking: itemData.parking || null,
                        usefee: itemData.usefee || null
                    }
                };
            }
        }
        
        return { success: false, code, msg: data.resultMsg };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===== contentTypeId 포함 테스트 =====
async function testWithType(apiKey, contentId, contentTypeId) {
    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const code = data.resultCode || data.response?.header?.resultCode;
        const msg = data.resultMsg || data.response?.header?.resultMsg;
        
        if (code === '0' || code === '0000') {
            const item = data.response?.body?.items?.item || data.items?.item || data.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    success: true,
                    method: `contentTypeId_${contentTypeId}`,
                    data: {
                        overview: itemData.overview?.substring(0, 50) || null,
                        tel: itemData.tel || null
                    }
                };
            }
        }
        
        return { success: false, contentTypeId, code, msg };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===== DetailIntro 테스트 =====
async function testDetailIntro(apiKey, contentId) {
    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=32`;
        
        const response = await fetch(url);
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const code = data.resultCode || data.response?.header?.resultCode;
        
        if (code === '0' || code === '0000') {
            const item = data.response?.body?.items?.item || data.items?.item || data.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    success: true,
                    method: 'DetailIntro',
                    data: {
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null,
                        roomType: itemData.roomtype || null
                    }
                };
            }
        }
        
        return { success: false, code, msg: data.resultMsg };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}
