// api/test.js (기존 파일에 test=3 추가)

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { test = '1' } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: '❌ API 키 없음' });
        }

        const contentId = '142785';
        let result = {};

        if (test === '1') {
            // DetailCommon (이미 성공 확인됨)
            const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const response = await fetch(url);
            const data = await response.json();
            const code = data.resultCode || data.response?.header?.resultCode;
            
            if (code === '0' || code === '0000') {
                const item = data.response?.body?.items?.item || data.items?.item || data.item;
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    result = {
                        success: true,
                        overview: itemData.overview?.substring(0, 50) || null,
                        tel: itemData.tel || null,
                        homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null
                    };
                }
            }
        } 
        else if (test === '2') {
            // DetailIntro 
            const url = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=32`;
            const response = await fetch(url);
            const data = await response.json();
            const code = data.resultCode || data.response?.header?.resultCode;
            
            if (code === '0' || code === '0000') {
                const item = data.response?.body?.items?.item || data.items?.item || data.item;
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    result = {
                        success: true,
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null
                    };
                }
            }
        }
        else if (test === '3') {
            // 둘 다 합치기
            result = { api: 'both', step: 'testing' };
        }

        return res.status(200).json({
            success: true,
            test: test,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
