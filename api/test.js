// api/test.js (안정적인 export default 버전)

export default async function handler(req, res) {
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
            // DetailCommon 
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
            // 성공 확인된 완전한 버전
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=32`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            let common = null;
            let intro = null;
            
            // DetailCommon 처리
            const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
            if (commonCode === '0' || commonCode === '0000') {
                const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
                if (commonItem) {
                    const commonItemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                    common = {
                        overview: commonItemData.overview || null,
                        tel: commonItemData.tel || null,
                        homepage: commonItemData.homepage?.replace(/<[^>]*>/g, '') || null,
                        usetime: commonItemData.usetime || null,
                        parking: commonItemData.parking || null
                    };
                }
            }
            
            // DetailIntro 처리
            const introCode = introData.resultCode || introData.response?.header?.resultCode;
            if (introCode === '0' || introCode === '0000') {
                const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
                if (introItem) {
                    const introItemData = Array.isArray(introItem) ? introItem[0] : introItem;
                    intro = {
                        roomCount: introItemData.roomcount || null,
                        checkIn: introItemData.checkintime || null,
                        checkOut: introItemData.checkouttime || null,
                        roomType: introItemData.roomtype || null
                    };
                }
            }
            
            // 완성도 계산
            let completeness = 20;
            if (common?.overview) completeness += 30;
            if (common?.tel) completeness += 10;
            if (common?.homepage) completeness += 15;
            if (intro?.roomCount) completeness += 10;
            if (intro?.checkIn) completeness += 5;
            
            result = {
                success: true,
                api: 'Both',
                common: common,
                intro: intro,
                completeness: Math.min(completeness, 100)
            };
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
}
