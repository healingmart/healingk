// api/detailtest.js (완전 새로운 파일)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { test = '1' } = req.query;
    const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY;
    
    if (!apiKey) {
        return res.json({ error: 'API 키 없음' });
    }

    const contentId = '142785';
    let result = {};

    try {
        if (test === '1') {
            // DetailCommon (성공 확인됨)
            const url1 = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            
            const res1 = await fetch(url1);
            const data1 = await res1.json();
            const code1 = data1.resultCode || data1.response?.header?.resultCode;
            
            if (code1 === '0' || code1 === '0000') {
                const item = data1.response?.body?.items?.item || data1.items?.item || data1.item;
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    result = {
                        success: true,
                        api: 'DetailCommon',
                        overview: itemData.overview?.substring(0, 80) || null,
                        tel: itemData.tel || null,
                        homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null
                    };
                }
            } else {
                result = { success: false, code: code1, msg: data1.resultMsg };
            }
        } 
        else if (test === '2') {
            // DetailIntro 
            const url2 = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=32`;
            
            const res2 = await fetch(url2);
            const data2 = await res2.json();
            const code2 = data2.resultCode || data2.response?.header?.resultCode;
            
            if (code2 === '0' || code2 === '0000') {
                const item = data2.response?.body?.items?.item || data2.items?.item || data2.item;
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    result = {
                        success: true,
                        api: 'DetailIntro',
                        roomCount: itemData.roomcount || null,
                        checkIn: itemData.checkintime || null,
                        checkOut: itemData.checkouttime || null,
                        roomType: itemData.roomtype || null
                    };
                }
            } else {
                result = { success: false, code: code2, msg: data2.resultMsg };
            }
        }
        else if (test === '3') {
            // 두 API 모두 호출 (완전한 세밀한 정보)
            const url1 = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const url2 = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=32`;
            
            const [res1, res2] = await Promise.all([fetch(url1), fetch(url2)]);
            const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
            
            let commonInfo = null;
            let introInfo = null;
            
            // DetailCommon 결과
            const code1 = data1.resultCode || data1.response?.header?.resultCode;
            if (code1 === '0' || code1 === '0000') {
                const item1 = data1.response?.body?.items?.item || data1.items?.item || data1.item;
                if (item1) {
                    const itemData1 = Array.isArray(item1) ? item1[0] : item1;
                    commonInfo = {
                        overview: itemData1.overview || null,
                        tel: itemData1.tel || null,
                        homepage: itemData1.homepage?.replace(/<[^>]*>/g, '') || null,
                        usetime: itemData1.usetime || null,
                        parking: itemData1.parking || null
                    };
                }
            }
            
            // DetailIntro 결과
            const code2 = data2.resultCode || data2.response?.header?.resultCode;
            if (code2 === '0' || code2 === '0000') {
                const item2 = data2.response?.body?.items?.item || data2.items?.item || data2.item;
                if (item2) {
                    const itemData2 = Array.isArray(item2) ? item2[0] : item2;
                    introInfo = {
                        roomCount: itemData2.roomcount || null,
                        checkIn: itemData2.checkintime || null,
                        checkOut: itemData2.checkouttime || null,
                        roomType: itemData2.roomtype || null
                    };
                }
            }
            
            result = {
                success: true,
                api: 'Both',
                common: commonInfo,
                intro: introInfo,
                completeness: calculateCompleteness(commonInfo, introInfo)
            };
        }

        return res.json({
            success: true,
            test: test,
            contentId: contentId,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.json({
            success: false,
            error: error.message,
            test: test
        });
    }
}

function calculateCompleteness(common, intro) {
    let score = 20; // 기본 점수
    
    if (common?.overview) score += 30;
    if (common?.tel) score += 10;
    if (common?.homepage) score += 15;
    if (common?.usetime) score += 10;
    if (intro?.roomCount) score += 10;
    if (intro?.checkIn) score += 5;
    
    return Math.min(score, 100);
}
